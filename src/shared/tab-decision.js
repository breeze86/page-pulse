/**
 * Tab selection rules.
 *
 * Keeping this pure makes the tricky part (which tabs to refresh, when to open
 * a new tab) testable without a browser.
 */

import { deriveOpenUrl, matchUrl } from './matcher.js';

/** URL to open when a rule fires with no matching tab open. */
export function resolveOpenUrl(rule) {
  const startUrl = String(rule?.startUrl ?? '').trim();
  if (startUrl) return startUrl;
  return deriveOpenUrl(rule?.match) || null;
}

export function matchedTabs(tabs, rule) {
  const list = Array.isArray(tabs) ? tabs : [];
  return list.filter((tab) => {
    if (!tab || typeof tab.url !== 'string' || typeof tab.id !== 'number') return false;
    return matchUrl(tab.url, rule?.match);
  });
}

/**
 * @param {object} input
 * @param {Array<object>} input.tabs all tabs from chrome.tabs.query
 * @param {object} input.rule
 * @param {Set<number>} input.focusedWindowIds windows that currently have focus
 * @param {boolean} [input.manual] manual refresh ignores skipActive/skipAudible
 * @returns {{
 *   matchedCount: number,
 *   selected: Array<object>,
 *   skipped: Array<{tabId: number, reason: string}>,
 *   openUrl: string|null,
 *   canOpen: boolean
 * }}
 */
export function decideRefresh({ tabs, rule, focusedWindowIds = new Set(), manual = false }) {
  const options = rule?.options || {};
  const matched = matchedTabs(tabs, rule);
  const selected = [];
  const skipped = [];

  for (const tab of matched) {
    if (tab.discarded) {
      skipped.push({ tabId: tab.id, reason: 'discarded' });
      continue;
    }
    if (tab.status === 'loading') {
      skipped.push({ tabId: tab.id, reason: 'loading' });
      continue;
    }
    if (!manual) {
      if (options.skipActive !== false && tab.active && focusedWindowIds.has(tab.windowId)) {
        skipped.push({ tabId: tab.id, reason: 'active' });
        continue;
      }
      if (options.skipAudible !== false && tab.audible) {
        skipped.push({ tabId: tab.id, reason: 'audible' });
        continue;
      }
    }
    selected.push(tab);
  }

  const reloadAll = manual ? true : options.reloadAllTabs !== false;
  const chosen = reloadAll ? selected : selected.slice(0, 1);
  const openUrl = matched.length === 0 ? resolveOpenUrl(rule) : null;

  return {
    matchedCount: matched.length,
    selected: chosen,
    skipped,
    openUrl,
    canOpen: matched.length === 0 && Boolean(openUrl),
  };
}

/** Map a refresh result to the persisted outcome code. */
export function outcomeOf(result) {
  if (!result) return 'error';
  if (result.error) return 'error';
  if (Array.isArray(result.reloaded) && result.reloaded.length > 0) return 'reloaded';
  if (result.openedTabId != null) return 'opened';
  if (Array.isArray(result.skipped) && result.skipped.length > 0) return 'skipped';
  return 'no-tab';
}
