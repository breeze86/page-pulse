/**
 * The single high-level writer: persist a mutation, then repair alarms and the
 * badge so state and timers can never drift apart.
 */

import { clearAllRuleAlarms, clearRuleAlarm, reconcile, syncBadge } from './alarm-service.js';
import { getState, mutateState } from './storage.js';

export { getState };

/**
 * @param {(state: object) => (object | Promise<object>)} mutator
 * @param {{rescheduleIds?: string[], rescheduleAll?: boolean}} [options]
 */
export async function commitState(mutator, options = {}) {
  const { rescheduleIds = [], rescheduleAll = false } = options;

  // Mutate first: if validation/limit checks throw, timers stay untouched.
  const state = await mutateState(mutator);

  if (rescheduleAll) {
    await clearAllRuleAlarms();
  } else {
    for (const id of rescheduleIds) await clearRuleAlarm(id);
  }

  await reconcile(state);
  await syncBadge(state);
  return state;
}
