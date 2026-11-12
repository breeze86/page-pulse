/**
 * Integration test for the service-worker pipeline with an in-memory chrome
 * API mock: save rule -> alarm -> refresh -> stats -> re-arm, plus the
 * no-matching-tab auto-open path and global pause/resume.
 *
 * Node runs each test file in its own process, so the fake global stays here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STORAGE_KEY } from '../src/shared/constants.js';
import { alarmName } from '../src/shared/scheduler.js';

function createFakeChrome() {
  const storage = new Map();
  const alarms = new Map();
  const tabs = [];
  const calls = { reload: [], create: [], badge: [] };
  let nextTabId = 100;

  const chrome = {
    storage: {
      local: {
        async get(key) {
          return { [key]: storage.has(key) ? structuredClone(storage.get(key)) : undefined };
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) {
            storage.set(key, structuredClone(value));
          }
        },
      },
    },
    alarms: {
      create(name, info) {
        alarms.set(name, { name, scheduledTime: info.when });
      },
      async clear(name) {
        return alarms.delete(name);
      },
      async getAll() {
        return [...alarms.values()].map((alarm) => ({ ...alarm }));
      },
    },
    tabs: {
      async query() {
        return tabs.map((tab) => ({ ...tab }));
      },
      async reload(id, options) {
        calls.reload.push({ id, options });
        return undefined;
      },
      async create(props) {
        calls.create.push({ ...props });
        const tab = {
          id: (nextTabId += 1),
          url: props.url,
          windowId: props.windowId ?? 1,
          active: Boolean(props.active),
          audible: false,
          discarded: false,
          status: 'complete',
        };
        tabs.push(tab);
        return { ...tab };
      },
    },
    windows: {
      async getAll() {
        return [{ id: 1, focused: true }];
      },
      async getLastFocused() {
        return { id: 1, focused: true };
      },
    },
    action: {
      async setBadgeText(value) {
        calls.badge.push(typeof value === 'string' ? value : (value?.text ?? ''));
      },
      async setBadgeBackgroundColor() {
        return undefined;
      },
    },
  };

  return { chrome, storage, alarms, tabs, calls };
}

function makeTab(overrides = {}) {
  return {
    id: 1,
    url: 'https://example.com/page',
    windowId: 1,
    active: false,
    audible: false,
    discarded: false,
    status: 'complete',
    ...overrides,
  };
}

test('rule lifecycle drives alarms, reloads, stats, auto-open and pause', async () => {
  const fake = createFakeChrome();
  globalThis.chrome = fake.chrome;

  const rules = await import('../src/background/rule-service.js');
  const refresh = await import('../src/background/refresh-service.js');

  // 1. Save a rule: one alarm must be armed within [30s, 30s].
  const saved = await rules.saveRule({
    name: 'Example',
    match: { type: 'host', value: 'example.com' },
    interval: { minSec: 30, maxSec: 30 },
  });
  assert.equal(saved.state.rules.length, 1);
  const ruleId = saved.state.rules[0].id;
  const name = alarmName(ruleId);

  const armed = fake.alarms.get(name);
  assert.ok(armed, 'alarm should exist after saving a rule');
  const delay = armed.scheduledTime - Date.now();
  assert.ok(delay > 25_000 && delay <= 30_000, `unexpected delay ${delay}`);
  assert.equal(saved.runtime[0].dueAt, armed.scheduledTime);
  assert.ok(fake.calls.badge.at(-1) === '1', 'badge should show the enabled rule count');

  // 2. A matching tab is reloaded; stats persist; the timer is re-armed.
  fake.tabs.push(makeTab({ id: 1 }));
  const first = await refresh.runRule(saved.state.rules[0]);
  assert.deepEqual(first.reloaded, [1]);
  assert.equal(first.outcome, 'reloaded');

  fake.alarms.delete(name); // simulate the one-shot alarm having fired
  await rules.applyResult(ruleId, first);

  const afterRun = await rules.getStatePayload();
  assert.equal(afterRun.state.rules[0].stats.refreshCount, 1);
  assert.equal(afterRun.state.rules[0].stats.lastOutcome, 'reloaded');
  assert.ok(fake.alarms.has(name), 'alarm should be re-armed after a run');
  assert.equal(fake.calls.reload.length, 1);
  assert.equal(fake.calls.reload[0].id, 1);
  assert.equal(fake.calls.reload[0].options.bypassCache, false);
  assert.ok(fake.storage.get(STORAGE_KEY).rules.length === 1, 'state should be persisted');

  // 3. No matching tab: open a background tab on the derived URL.
  fake.tabs.length = 0;
  fake.calls.reload.length = 0;
  const second = await refresh.runRule(saved.state.rules[0]);
  assert.equal(second.matchedCount, 0);
  assert.equal(second.outcome, 'opened');
  assert.equal(fake.calls.create.length, 1);
  assert.equal(fake.calls.create[0].url, 'https://example.com/');
  assert.equal(fake.calls.create[0].active, false);
  assert.equal(fake.calls.create[0].windowId, 1);

  await rules.applyResult(ruleId, second);
  const afterOpen = await rules.getStatePayload();
  assert.equal(afterOpen.state.rules[0].stats.lastOutcome, 'opened');
  assert.equal(afterOpen.state.rules[0].stats.consecutiveMisses, 0);

  // 4. Global pause clears every alarm; resuming re-arms exactly one.
  await rules.setGlobalEnabled(false);
  assert.equal(fake.alarms.size, 0);
  assert.equal(fake.calls.badge.at(-1), '\u23F8');

  await rules.setGlobalEnabled(true);
  assert.equal(fake.alarms.size, 1);

  // 5. Deleting the rule leaves no orphan alarm behind.
  await rules.deleteRule(ruleId);
  assert.equal(fake.alarms.size, 0);
  assert.equal((await rules.getStatePayload()).state.rules.length, 0);
});

test('manual refresh ignores the focused/audible policy and refreshes all tabs', async () => {
  const fake = createFakeChrome();
  globalThis.chrome = fake.chrome;

  const rules = await import('../src/background/rule-service.js');
  const refresh = await import('../src/background/refresh-service.js');

  const saved = await rules.saveRule({
    name: 'All tabs',
    match: { type: 'glob', value: 'https://example.com/**' },
    interval: { minSec: 60, maxSec: 120 },
    options: { skipActive: true, skipAudible: true, reloadAllTabs: false },
  });
  const rule = (await rules.getStatePayload()).state.rules[0];

  fake.tabs.push(
    makeTab({ id: 11, active: true, audible: true }),
    makeTab({ id: 12, url: 'https://example.com/two' }),
    makeTab({ id: 13, url: 'https://other.dev/' }),
  );

  const scheduled = await refresh.runRule(rule);
  assert.deepEqual(scheduled.reloaded, [12], 'manual=false should respect policy and reloadAllTabs');

  fake.calls.reload.length = 0;
  const manual = await refresh.runRule(rule, { manual: true });
  assert.deepEqual(manual.reloaded.sort(), [11, 12]);

  await rules.deleteRule(saved.state.rules[0].id);
});

test('invalid drafts are rejected without touching timers or state', async () => {
  const fake = createFakeChrome();
  globalThis.chrome = fake.chrome;

  const rules = await import('../src/background/rule-service.js');

  await assert.rejects(
    () => rules.saveRule({ match: { type: 'host', value: '' }, interval: { minSec: 10, maxSec: 5 } }),
    (error) => error.code === 'VALIDATION_FAILED' && error.errors.length >= 2,
  );
  assert.equal(fake.alarms.size, 0);
  assert.equal(fake.storage.size, 0);
});

test('import merges or replaces rules and reschedules alarms', async () => {
  const fake = createFakeChrome();
  globalThis.chrome = fake.chrome;

  const rules = await import('../src/background/rule-service.js');
  await rules.saveRule({
    name: 'Keep me',
    match: { type: 'host', value: 'keep.example' },
    interval: { minSec: 60, maxSec: 60 },
  });

  const payload = {
    rules: [
      {
        name: 'Merged',
        match: { type: 'host', value: 'merged.example' },
        interval: { minSec: 90, maxSec: 90 },
      },
    ],
  };

  const merged = await rules.importConfig(payload, 'merge');
  assert.equal(merged.state.rules.length, 2);
  assert.equal(merged.import.imported, 1);
  assert.equal(fake.alarms.size, 2);

  const replaced = await rules.importConfig(payload, 'replace');
  assert.equal(replaced.state.rules.length, 1);
  assert.equal(replaced.state.rules[0].name, 'Merged');
  assert.equal(fake.alarms.size, 1);

  await assert.rejects(
    () => rules.importConfig({ nope: true }, 'merge'),
    (error) => error.code === 'VALIDATION_FAILED',
  );
});
