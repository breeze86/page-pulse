import test from 'node:test';
import assert from 'node:assert/strict';

import { alarmName, computeNextDueAt, planAlarms, ruleIdFromAlarm } from '../src/shared/scheduler.js';

test('alarm names are namespaced and reversible', () => {
  assert.equal(alarmName('abc'), 'pp:rule:abc');
  assert.equal(ruleIdFromAlarm('pp:rule:abc'), 'abc');
  assert.equal(ruleIdFromAlarm('something-else'), null);
  assert.equal(ruleIdFromAlarm(undefined), null);
});

test('planAlarms creates alarms for enabled rules that have none', () => {
  const plan = planAlarms(
    [
      { id: 'a', enabled: true },
      { id: 'b', enabled: false },
    ],
    [],
    { globalEnabled: true },
  );
  assert.deepEqual(plan.create, [{ ruleId: 'a', name: 'pp:rule:a' }]);
  assert.deepEqual(plan.clear, []);
});

test('planAlarms keeps matching alarms and clears orphans', () => {
  const plan = planAlarms(
    [{ id: 'a', enabled: true }],
    ['pp:rule:a', 'pp:rule:deleted', 'pp:rule:disabled'],
    { globalEnabled: true },
  );
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.keep, ['pp:rule:a']);
  assert.deepEqual(plan.clear.sort(), ['pp:rule:deleted', 'pp:rule:disabled']);
});

test('planAlarms clears everything when the global switch is off', () => {
  const plan = planAlarms([{ id: 'a', enabled: true }], ['pp:rule:a', 'pp:rule:b'], {
    globalEnabled: false,
  });
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.clear.sort(), ['pp:rule:a', 'pp:rule:b']);
});

test('computeNextDueAt is deterministic with an injected rand', () => {
  const due = computeNextDueAt({ minSec: 60, maxSec: 120 }, 1000, () => 0);
  assert.equal(due, 1000 + 60_000);
  const lastBucket = computeNextDueAt({ minSec: 60, maxSec: 120 }, 1000, () => 0.999999);
  assert.equal(lastBucket, 1000 + 120_000);
});
