/**
 * URL matching and open-URL derivation.
 *
 * Three match types are supported:
 *  - host : the host itself and all of its subdomains (case-insensitive)
 *  - glob : whole-URL wildcard, `*` does not cross `/`, `**` does
 *  - regex: JavaScript regular expression against the full URL
 *
 * Only http(s) URLs are ever matched; extension pages, about:, file: and
 * chrome:// URLs are rejected on purpose.
 */

import { MATCH_TYPES, MAX_REGEX_LENGTH } from './constants.js';

const HOST_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST_RE = new RegExp(`^${HOST_LABEL}(?:\\.${HOST_LABEL})*$`, 'i');
const URL_SPLIT_RE = /^([a-z*][a-z0-9+.\-*]*:\/\/[^/?#]*)([\s\S]*)$/i;
const REGEX_CACHE_LIMIT = 200;
const regexCache = new Map();

/** Parse an absolute http(s) URL, or return null. */
export function parseHttpUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Split a URL (or a glob pattern) into its origin and everything after it.
 * The rest keeps search/hash so a glob can target them too.
 *
 * @returns {{origin: string, rest: string} | null}
 */
export function splitUrl(value) {
  if (typeof value !== 'string') return null;
  const m = URL_SPLIT_RE.exec(value.trim());
  if (!m) return null;
  return { origin: m[1], rest: m[2] || '' };
}

function escapeRegExp(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globSource(part) {
  let out = '';
  for (let i = 0; i < part.length; i += 1) {
    const ch = part[i];
    if (ch === '*') {
      if (part[i + 1] === '*') {
        out += '[\\s\\S]*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else {
      out += escapeRegExp(ch);
    }
  }
  return out;
}

function compileGlob(pattern) {
  const cached = regexCache.get(`glob\u0000${pattern}`);
  if (cached) return cached;
  const parts = splitUrl(pattern);
  if (!parts) return null;
  const compiled = {
    origin: new RegExp(`^${globSource(parts.origin)}$`, 'i'),
    // An omitted path means "any path", which is what users expect from
    // `https://example.com` style input.
    path: parts.rest ? new RegExp(`^${globSource(parts.rest)}$`) : /^[\s\S]*$/,
  };
  if (regexCache.size >= REGEX_CACHE_LIMIT) regexCache.clear();
  regexCache.set(`glob\u0000${pattern}`, compiled);
  return compiled;
}

function compileRegex(pattern) {
  const cached = regexCache.get(`regex\u0000${pattern}`);
  if (cached) return cached;
  let compiled;
  try {
    compiled = new RegExp(pattern, 'iu');
  } catch {
    return null;
  }
  if (regexCache.size >= REGEX_CACHE_LIMIT) regexCache.clear();
  regexCache.set(`regex\u0000${pattern}`, compiled);
  return compiled;
}

/** True when `hostname` equals `pattern` or is one of its subdomains. */
export function hostMatches(hostname, pattern) {
  if (typeof hostname !== 'string' || typeof pattern !== 'string') return false;
  const bare = pattern.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  if (!bare) return false;
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  return host === bare || host.endsWith(`.${bare}`);
}

/** @returns {boolean} */
export function matchUrl(rawUrl, match) {
  if (!match || !MATCH_TYPES.includes(match.type)) return false;
  const url = parseHttpUrl(rawUrl);
  if (!url) return false;

  if (match.type === 'host') {
    return hostMatches(url.hostname, match.value);
  }

  if (match.type === 'glob') {
    const compiled = compileGlob(match.value);
    const parts = splitUrl(url.href);
    if (!compiled || !parts) return false;
    return compiled.origin.test(parts.origin) && compiled.path.test(parts.rest);
  }

  const re = compileRegex(match.value);
  return re ? re.test(url.href) : false;
}

/**
 * Normalise and validate a match input coming from the UI or an import.
 *
 * @returns {{ok: true, type: string, value: string} | {ok: false, code: string}}
 */
export function normalizeMatchInput(type, raw) {
  if (!MATCH_TYPES.includes(type)) return { ok: false, code: 'match.type' };
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, code: 'match.required' };

  if (type === 'host') {
    let host = value.toLowerCase();
    const withScheme = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i.exec(host);
    if (withScheme) {
      const scheme = withScheme[1].toLowerCase();
      if (scheme !== 'http' && scheme !== 'https') return { ok: false, code: 'match.host' };
      host = withScheme[2];
    }
    host = host.replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
    if (host.startsWith('*.')) host = `*.${host.slice(2)}`;
    const bare = host.startsWith('*.') ? host.slice(2) : host;
    if (!bare || bare.length > 253 || !HOST_RE.test(bare)) {
      return { ok: false, code: 'match.host' };
    }
    return { ok: true, type, value: host };
  }

  if (type === 'glob') {
    if (value.length > 2048 || /\s/.test(value)) return { ok: false, code: 'match.glob' };
    const parts = splitUrl(value);
    if (!parts) return { ok: false, code: 'match.glob' };
    const scheme = parts.origin.slice(0, parts.origin.indexOf('://')).toLowerCase();
    if (scheme !== '*' && scheme !== 'http' && scheme !== 'https') {
      return { ok: false, code: 'match.glob' };
    }
    if (!parts.origin.slice(parts.origin.indexOf('://') + 3)) {
      return { ok: false, code: 'match.glob' };
    }
    return { ok: true, type, value };
  }

  if (value.length > MAX_REGEX_LENGTH) return { ok: false, code: 'match.regex' };
  try {
    new RegExp(value, 'iu');
  } catch {
    return { ok: false, code: 'match.regex' };
  }
  return { ok: true, type, value };
}

/**
 * Best-effort URL to open when a rule fires with no matching tab.
 * Regex rules cannot be derived, so they return null (the UI asks for a
 * start URL instead).
 */
export function deriveOpenUrl(match) {
  if (!match) return null;
  if (match.type === 'host') {
    const host = String(match.value || '').replace(/^\*\./, '');
    const url = parseHttpUrl(`https://${host}/`);
    return url ? url.href : null;
  }
  if (match.type === 'glob') {
    const parts = splitUrl(match.value);
    if (!parts) return null;
    const origin = parts.origin.replace(/^\*:\/\//i, 'https://');
    if (origin.includes('*')) return null;
    const url = parseHttpUrl(`${origin}/`);
    return url ? url.href : null;
  }
  return null;
}
