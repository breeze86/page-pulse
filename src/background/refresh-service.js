/**
 * Refresh execution: query tabs, decide what to do, reload and/or open a tab.
 *
 * Everything that touches `chrome.tabs`/`chrome.windows` lives here; the
 * decision logic itself stays in `shared/tab-decision.js` and is unit tested.
 */

import { decideRefresh, outcomeOf } from '../shared/tab-decision.js';

async function getFocusedWindowIds() {
  try {
    const windows = await chrome.windows.getAll({});
    return new Set(
      windows
        .filter((win) => win && win.focused && typeof win.id === 'number')
        .map((win) => win.id),
    );
  } catch (error) {
    console.warn('[PagePulse] windows query failed', error);
    return new Set();
  }
}

async function createTab(props) {
  const tab = await chrome.tabs.create(props);
  return tab?.id ?? null;
}

/** Open a background tab, preferring the last focused window. */
async function openBackgroundTab(url) {
  let windowId;
  try {
    const win = await chrome.windows.getLastFocused({});
    if (win && typeof win.id === 'number') windowId = win.id;
  } catch {
    windowId = undefined;
  }

  if (windowId !== undefined) {
    try {
      return await createTab({ url, active: false, windowId });
    } catch (error) {
      console.warn('[PagePulse] tab create with window failed, retrying', error);
    }
  }
  try {
    return await createTab({ url, active: false });
  } catch (error) {
    console.warn('[PagePulse] tab create failed', error);
    return null;
  }
}

/**
 * Run one refresh round for a rule.
 *
 * @param {object} rule
 * @param {{manual?: boolean}} [options]
 * @returns {Promise<{
 *   reloaded: number[],
 *   failed: Array<{tabId?: number, message: string}>,
 *   skipped: Array<{tabId: number, reason: string}>,
 *   matchedCount: number,
 *   openedTabId: number|null,
 *   openUrl: string|null,
 *   outcome: string
 * }>}
 */
export async function runRule(rule, options = {}) {
  const manual = Boolean(options.manual);

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (error) {
    console.warn('[PagePulse] tabs query failed', error);
    return {
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

  const decision = decideRefresh({
    tabs,
    rule,
    focusedWindowIds: await getFocusedWindowIds(),
    manual,
  });

  const reloaded = [];
  const failed = [];
  for (const tab of decision.selected) {
    try {
      await chrome.tabs.reload(tab.id, { bypassCache: Boolean(rule.options?.bypassCache) });
      reloaded.push(tab.id);
    } catch (error) {
      failed.push({ tabId: tab.id, message: String(error?.message || error) });
    }
  }

  let openedTabId = null;
  if (decision.canOpen) {
    openedTabId = await openBackgroundTab(decision.openUrl);
  }

  const result = {
    reloaded,
    failed,
    skipped: decision.skipped,
    matchedCount: decision.matchedCount,
    openedTabId,
    openUrl: decision.openUrl,
  };
  result.outcome = outcomeOf(result);
  return result;
}
