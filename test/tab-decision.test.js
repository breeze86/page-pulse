import test from 'node:test';
import assert from 'node:assert/strict';

import { decideRefresh, outcomeOf, resolveOpenUrl } from '../src/shared/tab-decision.js';

function tab(overrides = {}) {
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

function rule(overrides = {}) {
  return {
    match: { type: 'host', value: 'example.com' },
    startUrl: '',
    options: { skipActive: true, skipAudible: true, reloadAllTabs: true },
    ...overrides,
  };
}

const focused = new Set([1]);

test('reloads every matching tab when nothing is excluded', () => {
  const decision = decideRefresh({
    tabs: [tab({ id: 1 }), tab({ id: 2, url: 'https://a.example.com/x' })],
    rule: rule(),
    focusedWindowIds: focused,
  });
  assert.equal(decision.matchedCount, 2);
  assert.deepEqual(decision.selected.map((t) => t.id), [1, 2]);
  assert.equal(decision.canOpen, false);
});

test('skips the focused active tab but keeps it in other windows and background tabs', () => {
  const decision = decideRefresh({
    tabs: [
      tab({ id: 1, active: true }),
      tab({ id: 2, active: true, windowId: 2 }),
      tab({ id: 3 }),
    ],
    rule: rule(),
    focusedWindowIds: focused,
  });
  assert.deepEqual(decision.selected.map((t) => t.id), [2, 3]);
  assert.deepEqual(decision.skipped, [{ tabId: 1, reason: 'active' }]);
});

test('skipActive can be disabled per rule', () => {
  const decision = decideRefresh({
    tabs: [tab({ id: 1, active: true })],
    rule: rule({ options: { skipActive: false, skipAudible: true, reloadAllTabs: true } }),
    focusedWindowIds: focused,
  });
  assert.deepEqual(decision.selected.map((t) => t.id), [1]);
});

test('skips audible, loading and discarded tabs', () => {
  const decision = decideRefresh({
    tabs: [
      tab({ id: 1, audible: true }),
      tab({ id: 2, status: 'loading' }),
      tab({ id: 3, discarded: true }),
      tab({ id: 4 }),
    ],
    rule: rule(),
    focusedWindowIds: focused,
  });
  assert.deepEqual(decision.selected.map((t) => t.id), [4]);
  assert.deepEqual(
    decision.skipped.map((s) => s.reason),
    ['audible', 'loading', 'discarded'],
  );
});

test('manual refresh ignores the active/audible policy but not loading/discarded', () => {
  const decision = decideRefresh({
    tabs: [tab({ id: 1, active: true, audible: true }), tab({ id: 2, status: 'loading' })],
    rule: rule(),
    focusedWindowIds: focused,
    manual: true,
  });
  assert.deepEqual(decision.selected.map((t) => t.id), [1]);
});

test('reloadAllTabs=false refreshes only the first eligible tab', () => {
  const decision = decideRefresh({
    tabs: [tab({ id: 1 }), tab({ id: 2 })],
    rule: rule({ options: { skipActive: true, skipAudible: true, reloadAllTabs: false } }),
    focusedWindowIds: focused,
  });
  assert.deepEqual(decision.selected.map((t) => t.id), [1]);
});

test('no matching tab triggers a derived open URL', () => {
  const decision = decideRefresh({
    tabs: [tab({ id: 1, url: 'https://other.com/' })],
    rule: rule(),
    focusedWindowIds: focused,
  });
  assert.equal(decision.matchedCount, 0);
  assert.equal(decision.canOpen, true);
  assert.equal(decision.openUrl, 'https://example.com/');
});

test('startUrl wins over derivation; regex without startUrl cannot open', () => {
  assert.equal(
    resolveOpenUrl(rule({ startUrl: 'https://example.com/inbox' })),
    'https://example.com/inbox',
  );
  const regexRule = rule({ match: { type: 'regex', value: '^https://example\\.com/' } });
  assert.equal(resolveOpenUrl(regexRule), null);
  const decision = decideRefresh({ tabs: [], rule: regexRule, focusedWindowIds: focused });
  assert.equal(decision.canOpen, false);
  assert.equal(decision.openUrl, null);
});

test('outcomeOf maps results to stable codes', () => {
  assert.equal(outcomeOf({ reloaded: [1], skipped: [], openedTabId: null }), 'reloaded');
  assert.equal(outcomeOf({ reloaded: [], skipped: [], openedTabId: 9 }), 'opened');
  assert.equal(outcomeOf({ reloaded: [], skipped: [{ tabId: 1, reason: 'active' }] }), 'skipped');
  assert.equal(outcomeOf({ reloaded: [], skipped: [], openedTabId: null }), 'no-tab');
  assert.equal(outcomeOf({ error: true }), 'error');
  assert.equal(outcomeOf(null), 'error');
});
