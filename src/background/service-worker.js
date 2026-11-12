/**
 * Service worker entry point.
 *
 * Registers every event listener synchronously, then does async repair work.
 * Timing relies exclusively on chrome.alarms because MV3 service workers are
 * evicted after ~30s of inactivity.
 */

import { ALARM_PREFIX } from '../shared/constants.js';
import { ruleIdFromAlarm } from '../shared/scheduler.js';
import { syncBadge } from './alarm-service.js';
import { registerMessaging } from './messaging.js';
import { runRule } from './refresh-service.js';
import { applyResult } from './rule-service.js';
import { commitState, getState } from './state-store.js';
import { ensureInitialized } from './storage.js';

registerMessaging();

void ensureInitialized().catch((error) => {
  console.error('[PagePulse] initialization failed', error);
});

/** Persist a no-op mutation: guarantees alarms and badge match storage. */
async function repair() {
  await ensureInitialized();
  await commitState((state) => state);
}

chrome.runtime.onInstalled.addListener((details) => {
  void repair()
    .then(() => {
      if (details.reason === 'install') return chrome.runtime.openOptionsPage();
      return undefined;
    })
    .catch((error) => console.error('[PagePulse] onInstalled failed', error));
});

chrome.runtime.onStartup.addListener(() => {
  void repair().catch((error) => console.error('[PagePulse] onStartup failed', error));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm || typeof alarm.name !== 'string' || !alarm.name.startsWith(ALARM_PREFIX)) return;
  void handleAlarm(alarm.name);
});

async function handleAlarm(name) {
  try {
    const state = await getState();
    const ruleId = ruleIdFromAlarm(name);
    const rule = state.rules.find((candidate) => candidate.id === ruleId);

    if (!state.globalEnabled || !rule || !rule.enabled) {
      try {
        await chrome.alarms.clear(name);
      } catch (error) {
        console.warn('[PagePulse] failed to clear stale alarm', name, error);
      }
      await syncBadge(state);
      return;
    }

    let result;
    try {
      result = await runRule(rule);
    } catch (error) {
      console.error('[PagePulse] scheduled refresh failed', error);
      result = {
        error: true,
        outcome: 'error',
        reloaded: [],
        failed: [{ message: String(error?.message || error) }],
        skipped: [],
        matchedCount: 0,
        openedTabId: null,
        openUrl: null,
      };
    }

    // Committing re-runs reconciliation, which arms the next random alarm.
    await applyResult(rule.id, result);
  } catch (error) {
    console.error('[PagePulse] alarm handling failed', name, error);
  }
}
