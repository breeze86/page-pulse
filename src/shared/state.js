/**
 * State shape, validation, migration and import/export helpers.
 *
 * The service worker is the only writer, so all functions here are pure and
 * easy to unit test.
 */

import {
  APP_VERSION,
  DEFAULT_INTERVAL,
  DEFAULT_OPTIONS,
  MAX_INTERVAL_SEC,
  MAX_NAME_LENGTH,
  MAX_RULES,
  MIN_INTERVAL_SEC,
  SCHEMA_VERSION,
} from './constants.js';
import { normalizeMatchInput, parseHttpUrl } from './matcher.js';

export function newRuleId() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultStats() {
  return {
    lastRunAt: null,
    lastOutcome: null,
    refreshCount: 0,
    consecutiveMisses: 0,
  };
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function clampOptions(input, fallback) {
  const out = {};
  for (const key of Object.keys(DEFAULT_OPTIONS)) {
    out[key] = typeof input?.[key] === 'boolean' ? input[key] : fallback[key];
  }
  return out;
}

function normalizeStats(raw) {
  const stats = raw && typeof raw === 'object' ? raw : {};
  const lastRunAt = Number(stats.lastRunAt);
  return {
    lastRunAt: Number.isFinite(lastRunAt) && lastRunAt > 0 ? lastRunAt : null,
    lastOutcome: typeof stats.lastOutcome === 'string' ? stats.lastOutcome : null,
    refreshCount: Math.max(0, Math.floor(finiteOr(stats.refreshCount, 0))),
    consecutiveMisses: Math.max(0, Math.floor(finiteOr(stats.consecutiveMisses, 0))),
  };
}

export function createDefaultSettings() {
  return {
    defaults: {
      interval: { ...DEFAULT_INTERVAL },
      options: { ...DEFAULT_OPTIONS },
    },
  };
}

export function normalizeSettings(raw) {
  const settings = createDefaultSettings();
  const interval = raw?.defaults?.interval;
  const min = toInt(interval?.minSec);
  const max = toInt(interval?.maxSec);
  if (
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= MIN_INTERVAL_SEC &&
    max <= MAX_INTERVAL_SEC &&
    min <= max
  ) {
    settings.defaults.interval = { minSec: min, maxSec: max };
  }
  settings.defaults.options = clampOptions(raw?.defaults?.options, DEFAULT_OPTIONS);
  return settings;
}

export function createDefaultState(now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    globalEnabled: true,
    settings: createDefaultSettings(),
    rules: [],
    meta: { createdAt: now, updatedAt: now, appVersion: APP_VERSION },
  };
}

/** Human readable fallback name derived from the match value. */
export function defaultRuleName(match) {
  if (!match || typeof match.value !== 'string') return '';
  if (match.type === 'host') return match.value.replace(/^\*\./, '');
  if (match.type === 'glob') {
    const afterScheme = match.value.split('://')[1] || match.value;
    return afterScheme.split('/')[0] || match.value;
  }
  return '';
}

/**
 * Validate a rule draft coming from the UI or an import.
 *
 * @param {object} draft
 * @returns {{ok: true, errors: [], rule: object} | {ok: false, errors: Array<{field: string, code: string}>}}
 */
export function validateRuleDraft(draft) {
  const errors = [];
  const source = draft && typeof draft === 'object' ? draft : {};

  const name = String(source.name ?? '').trim();
  if (name.length > MAX_NAME_LENGTH) errors.push({ field: 'name', code: 'name.tooLong' });

  const match = normalizeMatchInput(source.match?.type, source.match?.value);
  if (!match.ok) errors.push({ field: 'match', code: match.code });

  const minSec = toInt(source.interval?.minSec);
  const maxSec = toInt(source.interval?.maxSec);
  if (!Number.isFinite(minSec) || !Number.isFinite(maxSec)) {
    errors.push({ field: 'interval', code: 'interval.required' });
  } else if (minSec > maxSec) {
    errors.push({ field: 'interval', code: 'interval.order' });
  } else if (minSec < MIN_INTERVAL_SEC || maxSec > MAX_INTERVAL_SEC) {
    errors.push({ field: 'interval', code: 'interval.range' });
  }

  const startUrl = String(source.startUrl ?? '').trim();
  if (startUrl && !parseHttpUrl(startUrl)) {
    errors.push({ field: 'startUrl', code: 'startUrl.invalid' });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    rule: {
      name: name || defaultRuleName(match),
      enabled: source.enabled === undefined ? true : Boolean(source.enabled),
      match: { type: match.type, value: match.value },
      startUrl,
      interval: { minSec, maxSec },
      options: clampOptions(source.options, DEFAULT_OPTIONS),
    },
  };
}

/**
 * Validate the default interval/options used for new rules.
 *
 * @returns {{ok: true, value: {interval: {minSec: number, maxSec: number}, options: object}} | {ok: false, errors: Array<{field: string, code: string}>}}
 */
export function validateDefaults(input) {
  const errors = [];
  const minSec = toInt(input?.interval?.minSec);
  const maxSec = toInt(input?.interval?.maxSec);

  if (!Number.isFinite(minSec) || !Number.isFinite(maxSec)) {
    errors.push({ field: 'interval', code: 'interval.required' });
  } else if (minSec > maxSec) {
    errors.push({ field: 'interval', code: 'interval.order' });
  } else if (minSec < MIN_INTERVAL_SEC || maxSec > MAX_INTERVAL_SEC) {
    errors.push({ field: 'interval', code: 'interval.range' });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      interval: { minSec, maxSec },
      options: clampOptions(input?.options, DEFAULT_OPTIONS),
    },
  };
}

/**
 * Build a complete rule from stored or imported data.
 * Invalid rules are dropped (returns null) instead of poisoning the state.
 */
export function normalizeRule(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const validation = validateRuleDraft(raw);
  if (!validation.ok) return null;
  const rule = validation.rule;
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : newRuleId(),
    ...rule,
    stats: normalizeStats(raw.stats),
    createdAt: finiteOr(raw.createdAt, now),
    updatedAt: finiteOr(raw.updatedAt, now),
  };
}

/** Coerce anything read from storage into a valid state object. */
export function migrateState(raw, now = Date.now()) {
  const state = createDefaultState(now);
  if (!raw || typeof raw !== 'object') return state;

  state.globalEnabled = raw.globalEnabled !== false;
  state.settings = normalizeSettings(raw.settings);

  // v2: "refresh every matching tab" is now opt-in. Reset only the shared
  // default; per-rule choices the user already made stay untouched.
  if ((Number(raw.schemaVersion) || 0) < 2) {
    state.settings.defaults.options.reloadAllTabs = false;
  }

  const seen = new Set();
  const rules = [];
  const sourceRules = Array.isArray(raw.rules) ? raw.rules : [];
  for (const item of sourceRules) {
    if (rules.length >= MAX_RULES) break;
    const rule = normalizeRule(item, now);
    if (!rule) continue;
    if (seen.has(rule.id)) rule.id = newRuleId();
    seen.add(rule.id);
    rules.push(rule);
  }
  state.rules = rules;

  state.meta = {
    createdAt: finiteOr(raw.meta?.createdAt, now),
    updatedAt: finiteOr(raw.meta?.updatedAt, now),
    appVersion: APP_VERSION,
  };
  return state;
}

/** Payload written to the export file. */
export function exportConfig(state) {
  return {
    app: 'PagePulse',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    globalEnabled: state.globalEnabled,
    settings: state.settings,
    rules: state.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      match: rule.match,
      startUrl: rule.startUrl,
      interval: rule.interval,
      options: rule.options,
    })),
  };
}

/**
 * Parse an import file (JSON string or object).
 * Returns null when the payload is not recognisable.
 */
export function parseImportPayload(raw, now = Date.now()) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;

  const candidates = Array.isArray(data) ? data : Array.isArray(data.rules) ? data.rules : null;
  if (!candidates) return null;

  const seen = new Set();
  const rules = [];
  for (const item of candidates) {
    if (rules.length >= MAX_RULES) break;
    const rule = normalizeRule(item, now);
    if (!rule) continue;
    if (seen.has(rule.id)) rule.id = newRuleId();
    seen.add(rule.id);
    rules.push(rule);
  }

  return {
    globalEnabled: data.globalEnabled !== false,
    settings: normalizeSettings(data.settings),
    rules,
  };
}

/** Replace all rules, or append the ones that fit. Imported counters are reset. */
export function mergeRules(currentRules, incomingRules, mode) {
  const incoming = Array.isArray(incomingRules) ? incomingRules : [];
  if (mode === 'replace') {
    const seen = new Set();
    return incoming.slice(0, MAX_RULES).map((rule) => {
      const copy = { ...rule, stats: defaultStats() };
      if (seen.has(copy.id)) copy.id = newRuleId();
      seen.add(copy.id);
      return copy;
    });
  }

  const seen = new Set((currentRules || []).map((rule) => rule.id));
  const merged = [...(currentRules || [])];
  for (const rule of incoming) {
    if (merged.length >= MAX_RULES) break;
    const copy = { ...rule, stats: defaultStats() };
    if (seen.has(copy.id)) copy.id = newRuleId();
    seen.add(copy.id);
    merged.push(copy);
  }
  return merged;
}
