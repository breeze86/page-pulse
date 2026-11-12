import test from 'node:test';
import assert from 'node:assert/strict';

import { clampIntervalSec, computeDelayMs, randomInt } from '../src/shared/random.js';
import { MAX_INTERVAL_SEC, MIN_INTERVAL_SEC } from '../src/shared/constants.js';

test('randomInt is inclusive on both bounds', () => {
  assert.equal(randomInt(30, 60, () => 0), 30);
  assert.equal(randomInt(30, 60, () => 0.999999), 60);
});

test('randomInt survives reversed bounds and non-integer input', () => {
  assert.equal(randomInt(60, 30, () => 0), 30);
  assert.equal(randomInt(30.4, 30.6, () => 0.5), 31);
});

test('randomInt rejects non-finite bounds', () => {
  assert.throws(() => randomInt(Number.NaN, 10), TypeError);
  assert.throws(() => randomInt(1, Infinity), TypeError);
});

test('randomInt clamps rand() === 1 to the last bucket', () => {
  assert.equal(randomInt(1, 3, () => 1), 3);
});

test('clampIntervalSec enforces the Chrome alarm floor and 24h ceiling', () => {
  assert.equal(clampIntervalSec(5), MIN_INTERVAL_SEC);
  assert.equal(clampIntervalSec(0), MIN_INTERVAL_SEC);
  assert.equal(clampIntervalSec(Number.NaN), MIN_INTERVAL_SEC);
  assert.equal(clampIntervalSec(MAX_INTERVAL_SEC + 1), MAX_INTERVAL_SEC);
  assert.equal(clampIntervalSec(90.4), 90);
});

test('computeDelayMs stays inside the requested range', () => {
  const interval = { minSec: 3600, maxSec: 7200 };
  for (let i = 0; i < 200; i += 1) {
    const ms = computeDelayMs(interval);
    assert.ok(ms >= 3600 * 1000 && ms <= 7200 * 1000, `out of range: ${ms}`);
    assert.equal(ms % 1000, 0);
  }
});

test('computeDelayMs clamps out-of-range rules instead of throwing', () => {
  assert.equal(computeDelayMs({ minSec: 1, maxSec: 2 }, () => 0), MIN_INTERVAL_SEC * 1000);
  assert.equal(
    computeDelayMs({ minSec: MAX_INTERVAL_SEC, maxSec: MAX_INTERVAL_SEC + 100 }, () => 0),
    MAX_INTERVAL_SEC * 1000,
  );
});
