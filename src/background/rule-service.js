/**
 * Rule CRUD, defaults, import/export and manual refresh.
 *
 * Every mutation goes through `commitState`, which persists first and then
 * repairs alarms + badge.
 */

import { MAX_RULES } from '../shared/constants.js';
import { AppError, ErrorCode, ValidationError } from '../shared/errors.js';
import {
  defaultStats,
  exportConfig,
  mergeRules,
  newRuleId,
  parseImportPayload,
  validateDefaults,
  validateRuleDraft,
} from '../shared/state.js';
import { getRuntimeStatus, reconcile, syncBadge } from './alarm-service.js';
import { runRule } from './refresh-service.js';
import { commitState, getState } from './state-store.js';

export async function getStatePayload() {
  const state = await getState();
  const runtime = await getRuntimeStatus(state);
  return { state, runtime, maxRules: MAX_RULES };
}

function assertRuleExists(state, id) {
  const rule = state.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new AppError(ErrorCode.RULE_NOT_FOUND, 'rule not found', { id });
  return rule;
}

export async function saveRule(draft) {
  const state = await getState();
  const validation = validateRuleDraft(draft);
  if (!validation.ok) throw new ValidationError(validation.errors);

  const draftId = typeof draft?.id === 'string' ? draft.id : '';
  const existing = draftId ? state.rules.find((rule) => rule.id === draftId) : undefined;
  if (!existing && state.rules.length >= MAX_RULES) {
    throw new AppError(ErrorCode.LIMIT_REACHED, 'rule limit reached', { limit: MAX_RULES });
  }

  const id = existing ? existing.id : newRuleId();
  const now = Date.now();

  await commitState(
    (current) => {
      const index = current.rules.findIndex((rule) => rule.id === id);
      if (index >= 0) {
        const previous = current.rules[index];
        current.rules[index] = {
          ...previous,
          ...validation.rule,
          id,
          stats: previous.stats,
          createdAt: previous.createdAt,
          updatedAt: now,
        };
      } else {
        current.rules.push({
          id,
          ...validation.rule,
          stats: defaultStats(),
          createdAt: now,
          updatedAt: now,
        });
      }
      return current;
    },
    // Editing must draw a fresh delay; the reconciler then arms the new alarm.
    { rescheduleIds: [id] },
  );

  return getStatePayload();
}

export async function deleteRule(id) {
  const state = await getState();
  assertRuleExists(state, id);
  await commitState((current) => {
    current.rules = current.rules.filter((rule) => rule.id !== id);
    return current;
  });
  return getStatePayload();
}

export async function setRuleEnabled(id, enabled) {
  const state = await getState();
  assertRuleExists(state, id);
  await commitState(
    (current) => {
      const rule = current.rules.find((candidate) => candidate.id === id);
      if (rule) {
        rule.enabled = Boolean(enabled);
        rule.updatedAt = Date.now();
      }
      return current;
    },
    { rescheduleIds: enabled ? [id] : [] },
  );
  return getStatePayload();
}

export async function setGlobalEnabled(enabled) {
  await commitState((current) => {
    current.globalEnabled = Boolean(enabled);
    return current;
  });
  return getStatePayload();
}

export async function saveDefaults(input) {
  const validation = validateDefaults(input);
  if (!validation.ok) throw new ValidationError(validation.errors);
  await commitState((current) => {
    current.settings.defaults = validation.value;
    return current;
  });
  return getStatePayload();
}

/** Refresh one rule right now, ignoring the focused/audible policy. */
export async function refreshNow(id) {
  const state = await getState();
  const rule = assertRuleExists(state, id);

  let result;
  try {
    result = await runRule(rule, { manual: true });
  } catch (error) {
    console.error('[PagePulse] manual refresh failed', error);
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

  await applyResult(id, result);
  return result;
}

/** Persist counters/outcome after a refresh round (also used by the SW). */
export async function applyResult(ruleId, result) {
  const now = Date.now();
  return commitState((current) => {
    const rule = current.rules.find((candidate) => candidate.id === ruleId);
    if (!rule) return current;

    rule.stats = rule.stats || defaultStats();
    rule.stats.lastRunAt = now;
    rule.stats.lastOutcome = result?.outcome || 'error';

    const reloaded = Array.isArray(result?.reloaded) ? result.reloaded.length : 0;
    if (reloaded > 0) rule.stats.refreshCount += reloaded;

    const missedNoTab =
      result?.matchedCount === 0 && result?.openedTabId == null && result?.outcome !== 'error';
    rule.stats.consecutiveMisses = missedNoTab ? rule.stats.consecutiveMisses + 1 : 0;
    return current;
  });
}

export async function importConfig(payload, mode) {
  const parsed = parseImportPayload(payload);
  if (!parsed) throw new ValidationError([{ field: 'import', code: 'import.invalid' }]);

  const replace = mode === 'replace';
  let imported = 0;

  await commitState(
    (current) => {
      const before = replace ? 0 : current.rules.length;
      current.rules = mergeRules(current.rules, parsed.rules, replace ? 'replace' : 'merge');
      imported = Math.max(0, current.rules.length - before);
      if (replace) {
        current.globalEnabled = parsed.globalEnabled;
        current.settings = parsed.settings;
      }
      return current;
    },
    { rescheduleAll: true },
  );

  return {
    ...(await getStatePayload()),
    import: { mode: replace ? 'replace' : 'merge', imported, received: parsed.rules.length },
  };
}

export async function exportConfigPayload() {
  const state = await getState();
  return exportConfig(state);
}

export async function reconcileNow() {
  const state = await getState();
  const result = await reconcile(state);
  await syncBadge(state);
  return { ...(await getStatePayload()), reconcile: result };
}
