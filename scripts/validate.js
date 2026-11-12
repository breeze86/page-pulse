#!/usr/bin/env node
/**
 * Static checks that do not need a browser:
 *  - manifest/locale JSON parse and version parity
 *  - referenced runtime files exist
 *  - zh_CN and en expose identical message keys
 *  - every i18n key used by HTML/JS exists
 *  - permissions stay on the agreed allow-list
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function readJson(relPath) {
  const abs = resolve(ROOT, relPath);
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    fail(`${relPath}: ${error.message}`);
    return null;
  }
}

const manifest = readJson('manifest.json');
const pkg = readJson('package.json');
const zh = readJson('_locales/zh_CN/messages.json');
const en = readJson('_locales/en/messages.json');

if (manifest) {
  if (manifest.manifest_version !== 3) fail('manifest: manifest_version must be 3');
  if (manifest.default_locale !== 'zh_CN') fail('manifest: default_locale must be zh_CN');
  if (!/^__MSG_appName__$/.test(manifest.name || '')) fail('manifest: name should use __MSG_appName__');
  if (!/^__MSG_appDesc__$/.test(manifest.description || '')) {
    fail('manifest: description should use __MSG_appDesc__');
  }
  if (manifest.name && manifest.name.length > 45) fail('manifest: name exceeds 45 chars');

  const expectedPermissions = ['alarms', 'storage', 'tabs'];
  const actual = [...(manifest.permissions || [])].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedPermissions)) {
    fail(`manifest: permissions must be exactly ${expectedPermissions.join(', ')}`);
  }
  if ((manifest.host_permissions || []).length > 0) {
    fail('manifest: host_permissions are intentionally empty (no content scripts)');
  }

  const referenced = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
  ].filter(Boolean);

  for (const rel of referenced) {
    if (!existsSync(resolve(ROOT, rel))) fail(`manifest: missing file ${rel}`);
  }

  if (pkg && manifest.version !== pkg.version) {
    fail(`version mismatch: manifest ${manifest.version} vs package ${pkg.version}`);
  }
  if (pkg && pkg.name !== 'page-pulse-extension') {
    fail(`package name should be page-pulse-extension, got ${pkg.name}`);
  }
}

if (zh && en) {
  const zhKeys = new Set(Object.keys(zh));
  const enKeys = new Set(Object.keys(en));
  for (const key of zhKeys) if (!enKeys.has(key)) fail(`locale: en is missing "${key}"`);
  for (const key of enKeys) if (!zhKeys.has(key)) fail(`locale: zh_CN is missing "${key}"`);
  for (const [locale, table] of [
    ['zh_CN', zh],
    ['en', en],
  ]) {
    for (const [key, entry] of Object.entries(table)) {
      if (!entry || typeof entry.message !== 'string' || !entry.message.trim()) {
        fail(`locale ${locale}: "${key}" has no message`);
      }
    }
  }

  // Collect keys referenced from HTML (data-i18n*) and JS (t('key'), errorMessage('code')).
  const files = [
    'popup/popup.html',
    'options/options.html',
    'popup/popup.js',
    'options/options.js',
  ];
  const used = new Set();
  for (const rel of files) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, 'utf8');
    for (const match of source.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
      used.add(match[1]);
    }
    for (const match of source.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) {
      used.add(match[1]);
    }
    for (const match of source.matchAll(/data-i18n-(?:placeholder|title|aria-label)="([^"]+)"/g)) {
      used.add(match[1]);
    }
  }

  // Keys referenced only indirectly through maps.
  for (const key of [
    'appName',
    'durationHour',
    'durationMinute',
    'durationSecond',
    'durationRange',
    'optionsMatchHostPlaceholder',
    'optionsMatchGlobPlaceholder',
    'optionsMatchRegexPlaceholder',
    'optionsMatchHostHint',
    'optionsMatchGlobHint',
    'optionsMatchRegexHint',
    'errNameTooLong',
    'errMatchType',
    'errMatchRequired',
    'errMatchHost',
    'errMatchGlob',
    'errMatchRegex',
    'errStartUrl',
    'errIntervalRequired',
    'errIntervalOrder',
    'errIntervalRange',
    'errLimitReached',
    'errStorage',
    'errNotFound',
    'errImportInvalid',
    'errUnknown',
  ]) {
    used.add(key);
  }

  for (const key of used) {
    if (!zhKeys.has(key)) fail(`i18n: "${key}" is used but missing from zh_CN`);
    if (!enKeys.has(key)) fail(`i18n: "${key}" is used but missing from en`);
  }
}

// README images: relative paths must exist so the rendered page never breaks.
const readmePath = resolve(ROOT, 'README.md');
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, 'utf8');
  for (const match of readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|data:)/.test(target)) continue;
    if (!existsSync(resolve(ROOT, target))) fail(`README.md: missing image ${target}`);
  }
}

// Page wiring: every element id used by the page script must exist, and every
// local stylesheet/script referenced by the HTML must be on disk.
const pages = [
  ['popup/popup.html', 'popup/popup.js'],
  ['options/options.html', 'options/options.js'],
];

for (const [htmlRel, jsRel] of pages) {
  const htmlPath = resolve(ROOT, htmlRel);
  const jsPath = resolve(ROOT, jsRel);
  if (!existsSync(htmlPath) || !existsSync(jsPath)) {
    fail(`page: missing ${htmlRel} or ${jsRel}`);
    continue;
  }

  const html = readFileSync(htmlPath, 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));

  const js = readFileSync(jsPath, 'utf8');
  const referenced = new Set();
  for (const match of js.matchAll(/getElementById\('([^']+)'\)/g)) referenced.add(match[1]);
  for (const match of js.matchAll(/querySelector\('#([A-Za-z0-9_-]+)/g)) referenced.add(match[1]);
  for (const id of referenced) {
    if (!ids.has(id)) fail(`${jsRel}: element #${id} not found in ${htmlRel}`);
  }

  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const ref = match[1];
    if (/^(https?:|data:|chrome-extension:)/.test(ref)) continue;
    if (!existsSync(resolve(dirname(htmlPath), ref))) {
      fail(`${htmlRel}: missing asset ${ref}`);
    }
  }
}

if (errors.length > 0) {
  console.error('✖ validation failed:');
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}

for (const message of warnings) console.warn(`⚠ ${message}`);
console.log('✔ manifest, locales, icons and i18n keys look good');
