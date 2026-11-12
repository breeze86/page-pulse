import test from 'node:test';
import assert from 'node:assert/strict';

import { validateDefaults } from '../src/shared/state.js';
import { DEFAULT_OPTIONS, MAX_INTERVAL_SEC } from '../src/shared/constants.js';

test('validateDefaults accepts a sane range and fills options', () => {
  const result = validateDefaults({
    interval: { minSec: '3600', maxSec: '7200' },
    options: { skipActive: false },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.interval, { minSec: 3600, maxSec: 7200 });
  assert.equal(result.value.options.skipActive, false);
  assert.equal(result.value.options.skipAudible, DEFAULT_OPTIONS.skipAudible);
});

test('validateDefaults rejects inverted, out-of-range and missing ranges', () => {
  const codes = (input) => validateDefaults(input).errors.map((entry) => entry.code);

  assert.ok(codes({ interval: { minSec: 7200, maxSec: 60 } }).includes('interval.order'));
  assert.ok(codes({ interval: { minSec: 5, maxSec: 60 } }).includes('interval.range'));
  assert.ok(
    codes({ interval: { minSec: 60, maxSec: MAX_INTERVAL_SEC + 1 } }).includes('interval.range'),
  );
  assert.ok(codes({ interval: { minSec: '', maxSec: '' } }).includes('interval.required'));
});
