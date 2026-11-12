/**
 * Alarm planning.
 *
 * Every enabled rule owns exactly one one-shot alarm. Re-arming with a fresh
 * random delay after each fire is what makes every round genuinely random
 * (a repeating alarm would drift into a fixed period).
 */

import { ALARM_PREFIX } from './constants.js';
import { computeDelayMs } from './random.js';

export function alarmName(ruleId) {
  return `${ALARM_PREFIX}${ruleId}`;
}

export function ruleIdFromAlarm(name) {
  if (typeof name !== 'string' || !name.startsWith(ALARM_PREFIX)) return null;
  return name.slice(ALARM_PREFIX.length);
}

/**
 * Pure decision table used by the reconciler and by tests.
 *
 * @param {Array<{id: string, enabled: boolean}>} rules
 * @param {string[]} existingAlarmNames
 * @param {{globalEnabled?: boolean}} [options]
 * @returns {{create: Array<{ruleId: string, name: string}>, clear: string[], keep: string[]}}
 */
export function planAlarms(rules, existingAlarmNames, options = {}) {
  const existing = new Set(Array.isArray(existingAlarmNames) ? existingAlarmNames : []);
  const create = [];
  const keep = [];

  if (options.globalEnabled === false) {
    return { create, clear: [...existing], keep };
  }

  const wanted = new Map();
  for (const rule of rules || []) {
    if (rule && rule.enabled) wanted.set(alarmName(rule.id), rule.id);
  }

  for (const [name, ruleId] of wanted) {
    if (existing.has(name)) keep.push(name);
    else create.push({ ruleId, name });
  }

  const clear = [];
  for (const name of existing) {
    if (!wanted.has(name)) clear.push(name);
  }

  return { create, clear, keep };
}

/** Absolute timestamp of the next fire for a rule. */
export function computeNextDueAt(interval, now = Date.now(), rand = Math.random) {
  return now + computeDelayMs(interval, rand);
}
