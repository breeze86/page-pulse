import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultState,
  defaultRuleName,
  exportConfig,
  mergeRules,
  migrateState,
  normalizeRule,
  parseImportPayload,
  validateRuleDraft,
} from '../src/shared/state.js';
import { DEFAULT_OPTIONS, MAX_NAME_LENGTH, MAX_RULES } from '../src/shared/constants.js';

const now = 1_700_000_000_000;

function draft(overrides = {}) {
  return {
    name: '知乎',
    match: { type: 'host', value: 'zhihu.com' },
    interval: { minSec: 3600, maxSec: 7200 },
    ...overrides,
  };
}

test('default state uses a 60–120 minute interval and safe options', () => {
  const state = createDefaultState(now);
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.globalEnabled, true);
  assert.deepEqual(state.settings.defaults.interval, { minSec: 3600, maxSec: 7200 });
  assert.deepEqual(state.settings.defaults.options, { ...DEFAULT_OPTIONS });
  assert.equal(state.settings.defaults.options.reloadAllTabs, false);
  assert.deepEqual(state.rules, []);
  assert.equal(state.meta.createdAt, now);
});

test('valid draft is normalised, including numeric strings from inputs', () => {
  const result = validateRuleDraft(
    draft({ interval: { minSec: '3600', maxSec: '7200' }, startUrl: 'https://zhihu.com/' }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.rule.interval.minSec, 3600);
  assert.equal(result.rule.interval.maxSec, 7200);
  assert.equal(result.rule.enabled, true);
  assert.deepEqual(result.rule.options, { ...DEFAULT_OPTIONS });
  assert.equal(result.rule.startUrl, 'https://zhihu.com/');
});

test('empty name falls back to something derived from the match', () => {
  assert.equal(defaultRuleName({ type: 'host', value: '*.zhihu.com' }), 'zhihu.com');
  assert.equal(defaultRuleName({ type: 'glob', value: 'https://example.com/app/**' }), 'example.com');
  assert.equal(validateRuleDraft(draft({ name: '  ' })).rule.name, 'zhihu.com');
});

test('interval validation covers order, range and missing values', () => {
  const codes = (d) => validateRuleDraft(d).errors.map((e) => e.code);

  assert.ok(codes(draft({ interval: { minSec: 7200, maxSec: 3600 } })).includes('interval.order'));
  assert.ok(codes(draft({ interval: { minSec: 10, maxSec: 60 } })).includes('interval.range'));
  assert.ok(codes(draft({ interval: { minSec: 60, maxSec: 90_000 } })).includes('interval.range'));
  assert.ok(codes(draft({ interval: { minSec: '', maxSec: '' } })).includes('interval.required'));
  assert.ok(codes(draft({ interval: { minSec: 29, maxSec: 30 } })).includes('interval.range'));
  assert.equal(validateRuleDraft(draft({ interval: { minSec: 30, maxSec: 30 } })).ok, true);
});

test('match and startUrl validation', () => {
  const codes = (d) => validateRuleDraft(d).errors.map((e) => e.code);

  assert.ok(codes(draft({ match: { type: 'host', value: '' } })).includes('match.required'));
  assert.ok(codes(draft({ match: { type: 'host', value: 'bad host' } })).includes('match.host'));
  assert.ok(codes(draft({ match: { type: 'glob', value: 'no-scheme' } })).includes('match.glob'));
  assert.ok(codes(draft({ match: { type: 'regex', value: '(' } })).includes('match.regex'));
  assert.ok(codes(draft({ match: { type: 'nope', value: 'x' } })).includes('match.type'));
  assert.ok(codes(draft({ startUrl: 'javascript:alert(1)' })).includes('startUrl.invalid'));
  assert.ok(codes(draft({ name: 'x'.repeat(MAX_NAME_LENGTH + 1) })).includes('name.tooLong'));
});

test('normalizeRule fills ids and stats and drops invalid rules', () => {
  const rule = normalizeRule({ ...draft(), id: 'fixed-id' }, now);
  assert.equal(rule.id, 'fixed-id');
  assert.equal(rule.stats.refreshCount, 0);
  assert.equal(rule.stats.consecutiveMisses, 0);
  assert.equal(rule.createdAt, now);

  assert.equal(normalizeRule({ match: { type: 'host', value: '' } }), null);
  assert.equal(normalizeRule(null), null);
});

test('migrateState repairs anything it is given', () => {
  assert.deepEqual(migrateState(null, now).rules, []);
  assert.equal(migrateState('nonsense', now).schemaVersion, 2);

  const migrated = migrateState(
    {
      schemaVersion: 0,
      globalEnabled: false,
      settings: { defaults: { interval: { minSec: 60, maxSec: 120 } } },
      rules: [
        { ...draft(), id: 'a' },
        { ...draft(), id: 'a' },
        { match: { type: 'host', value: '' } },
        'garbage',
      ],
      meta: { createdAt: 5 },
    },
    now,
  );

  assert.equal(migrated.globalEnabled, false);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.settings.defaults.interval, { minSec: 60, maxSec: 120 });
  assert.equal(migrated.rules.length, 2);
  assert.notEqual(migrated.rules[0].id, migrated.rules[1].id);
  assert.equal(migrated.meta.createdAt, 5);
});

test('v1 state resets the shared default but keeps per-rule choices', () => {
  const legacy = {
    schemaVersion: 1,
    settings: {
      defaults: {
        interval: { minSec: 3600, maxSec: 7200 },
        options: { ...DEFAULT_OPTIONS, reloadAllTabs: true },
      },
    },
    rules: [
      {
        ...draft(),
        id: 'legacy-rule',
        options: { ...DEFAULT_OPTIONS, reloadAllTabs: true },
      },
    ],
  };

  const migrated = migrateState(legacy, now);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.settings.defaults.options.reloadAllTabs, false);
  assert.equal(migrated.rules[0].options.reloadAllTabs, true);
});

test('migrateState caps the rule list', () => {
  const rules = Array.from({ length: MAX_RULES + 10 }, (_, i) => ({
    ...draft(),
    id: `rule-${i}`,
  }));
  assert.equal(migrateState({ rules }, now).rules.length, MAX_RULES);
});

test('parseImportPayload accepts objects, JSON strings and bare arrays', () => {
  const payload = exportConfig({
    ...createDefaultState(now),
    rules: [normalizeRule({ ...draft(), id: 'r1' }, now)],
  });

  const fromObject = parseImportPayload(payload, now);
  assert.equal(fromObject.rules.length, 1);
  assert.equal(fromObject.rules[0].name, '知乎');

  const fromString = parseImportPayload(JSON.stringify(payload), now);
  assert.equal(fromString.rules.length, 1);

  const fromArray = parseImportPayload([{ ...draft(), id: 'r2' }], now);
  assert.equal(fromArray.rules.length, 1);

  assert.equal(parseImportPayload('not json', now), null);
  assert.equal(parseImportPayload({ hello: 'world' }, now), null);
  assert.equal(parseImportPayload({ rules: 'nope' }, now), null);
});

test('exportConfig leaves stats behind', () => {
  const rule = normalizeRule({ ...draft(), id: 'r1' }, now);
  rule.stats.refreshCount = 7;
  const exported = exportConfig({ ...createDefaultState(now), rules: [rule] });
  assert.equal(exported.rules[0].stats, undefined);
  assert.equal(exported.rules[0].id, 'r1');
  assert.equal(exported.rules[0].interval.maxSec, 7200);
});

test('mergeRules resets counters and avoids id collisions', () => {
  const current = [normalizeRule({ ...draft(), id: 'same' }, now)];
  const incoming = [normalizeRule({ ...draft(), id: 'same' }, now), normalizeRule({ ...draft(), id: 'other' }, now)];

  const merged = mergeRules(current, incoming, 'merge');
  assert.equal(merged.length, 3);
  assert.equal(new Set(merged.map((r) => r.id)).size, 3);
  assert.ok(merged.every((r) => r.stats.refreshCount === 0));

  const replaced = mergeRules(current, incoming, 'replace');
  assert.equal(replaced.length, 2);
  assert.notEqual(replaced[0].id, replaced[1].id);
});

test('mergeRules never exceeds the rule cap', () => {
  const current = Array.from({ length: MAX_RULES }, (_, i) => normalizeRule({ ...draft(), id: `c-${i}` }, now));
  const incoming = [normalizeRule({ ...draft(), id: 'new' }, now)];
  const merged = mergeRules(current, incoming, 'merge');
  assert.equal(merged.length, MAX_RULES);
  assert.ok(!merged.some((r) => r.id === 'new'));

  const replaced = mergeRules(current, incoming, 'replace');
  assert.equal(replaced.length, 1);
});
