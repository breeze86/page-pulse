import test from 'node:test';
import assert from 'node:assert/strict';

import { formatClock, formatSpan, splitDuration } from '../src/shared/format.js';

const units = (unit) => ({ hour: 'h', minute: 'min', second: 's' })[unit];

test('splitDuration breaks seconds into parts', () => {
  assert.deepEqual(splitDuration(0), { hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(splitDuration(3661), { hours: 1, minutes: 1, seconds: 1 });
  assert.deepEqual(splitDuration(-5), { hours: 0, minutes: 0, seconds: 0 });
});

test('formatSpan renders readable spans', () => {
  assert.equal(formatSpan(30, units), '30 s');
  assert.equal(formatSpan(90, units), '1 min');
  assert.equal(formatSpan(5400, units), '1 h 30 min');
  assert.equal(formatSpan(7200, units), '2 h');
});

test('formatClock switches to h:mm:ss past an hour', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(65_000), '01:05');
  assert.equal(formatClock(3_723_000), '1:02:03');
  assert.equal(formatClock(-1000), '00:00');
});
