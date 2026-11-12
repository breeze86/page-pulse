/**
 * Random interval helpers.
 *
 * The randomness is injected (`rand`) so tests can be deterministic without
 * mocking globals.
 */

import { MAX_INTERVAL_SEC, MIN_INTERVAL_SEC } from './constants.js';

/**
 * Inclusive integer in [min, max].
 * Accepts reversed bounds so callers cannot produce an empty range by accident.
 *
 * @param {number} min
 * @param {number} max
 * @param {() => number} [rand] uniform in [0, 1)
 */
export function randomInt(min, max, rand = Math.random) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new TypeError('randomInt expects finite bounds');
  }
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new TypeError('randomInt expects finite bounds');
  }
  // Clamp custom rand() implementations that return 1.
  const r = Math.min(Math.max(Number(rand()), 0), 0.999999999999);
  return lo + Math.floor(r * (hi - lo + 1));
}

/** Clamp a user supplied interval bound into the range Chrome alarms allow. */
export function clampIntervalSec(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MIN_INTERVAL_SEC;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, n));
}

/**
 * Delay in milliseconds for one scheduling round.
 * Both bounds are clamped first so an out-of-range rule still schedules.
 *
 * @param {{minSec: number, maxSec: number}} interval
 * @param {() => number} [rand]
 */
export function computeDelayMs(interval, rand = Math.random) {
  const min = clampIntervalSec(interval?.minSec);
  const max = clampIntervalSec(interval?.maxSec);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return randomInt(lo, hi, rand) * 1000;
}
