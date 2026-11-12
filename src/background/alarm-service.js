/**
 * Alarm scheduling, reconciliation and the toolbar badge.
 *
 * One one-shot alarm per enabled rule; after every fire the rule is re-armed
 * with a newly drawn random delay.
 */

import {
  ALARM_PREFIX,
  BADGE_COLOR,
  BADGE_COLOR_PAUSED,
  BADGE_PAUSED,
} from '../shared/constants.js';
import { computeDelayMs } from '../shared/random.js';
import { alarmName, planAlarms } from '../shared/scheduler.js';

function createAlarm(name, when) {
  try {
    chrome.alarms.create(name, { when });
  } catch (error) {
    console.warn('[PagePulse] alarm create failed', name, error);
  }
}

async function clearAlarm(name) {
  try {
    await chrome.alarms.clear(name);
  } catch (error) {
    console.warn('[PagePulse] alarm clear failed', name, error);
  }
}

async function listRuleAlarms() {
  try {
    const alarms = await chrome.alarms.getAll();
    return alarms.filter((alarm) => typeof alarm.name === 'string' && alarm.name.startsWith(ALARM_PREFIX));
  } catch (error) {
    console.warn('[PagePulse] alarm list failed', error);
    return [];
  }
}

export async function scheduleRule(rule, rand = Math.random) {
  const name = alarmName(rule.id);
  const dueAt = Date.now() + computeDelayMs(rule.interval, rand);
  await clearAlarm(name);
  createAlarm(name, dueAt);
  return dueAt;
}

export async function clearRuleAlarm(ruleId) {
  await clearAlarm(alarmName(ruleId));
}

export async function clearAllRuleAlarms() {
  const alarms = await listRuleAlarms();
  for (const alarm of alarms) await clearAlarm(alarm.name);
}

/** Bring the set of alarms in line with the stored state. */
export async function reconcile(state, rand = Math.random) {
  const alarms = await listRuleAlarms();
  const plan = planAlarms(state.rules, alarms.map((alarm) => alarm.name), {
    globalEnabled: state.globalEnabled,
  });

  for (const name of plan.clear) await clearAlarm(name);

  for (const item of plan.create) {
    const rule = state.rules.find((candidate) => candidate.id === item.ruleId);
    if (!rule) continue;
    createAlarm(item.name, Date.now() + computeDelayMs(rule.interval, rand));
  }

  return { created: plan.create.length, cleared: plan.clear.length, kept: plan.keep.length };
}

/** Scheduled time per rule, for the UI countdown. */
export async function getRuntimeStatus(state) {
  const alarms = await listRuleAlarms();
  const dueByName = new Map(alarms.map((alarm) => [alarm.name, alarm.scheduledTime]));
  return state.rules.map((rule) => ({
    ruleId: rule.id,
    dueAt: dueByName.get(alarmName(rule.id)) ?? null,
  }));
}

export async function syncBadge(state) {
  const enabledCount = state.rules.filter((rule) => rule.enabled).length;
  const text = state.globalEnabled ? (enabledCount > 0 ? String(enabledCount) : '') : BADGE_PAUSED;
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({
      color: state.globalEnabled ? BADGE_COLOR : BADGE_COLOR_PAUSED,
    });
  } catch (error) {
    console.warn('[PagePulse] badge update failed', error);
  }
}
