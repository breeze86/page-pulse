/**
 * Message router between extension pages and the service worker.
 * Response envelope: {ok: true, data} | {ok: false, error}.
 */

import { MessageType } from '../shared/constants.js';
import { ErrorCode, toErrorPayload } from '../shared/errors.js';
import * as rules from './rule-service.js';

const handlers = {
  [MessageType.GET_STATE]: () => rules.getStatePayload(),
  [MessageType.SAVE_RULE]: (payload) => rules.saveRule(payload?.rule),
  [MessageType.DELETE_RULE]: (payload) => rules.deleteRule(payload?.id),
  [MessageType.SET_RULE_ENABLED]: (payload) => rules.setRuleEnabled(payload?.id, payload?.enabled),
  [MessageType.SET_GLOBAL_ENABLED]: (payload) => rules.setGlobalEnabled(payload?.enabled),
  [MessageType.SAVE_DEFAULTS]: (payload) => rules.saveDefaults(payload),
  [MessageType.REFRESH_NOW]: (payload) => rules.refreshNow(payload?.id),
  [MessageType.IMPORT_CONFIG]: (payload) => rules.importConfig(payload?.payload, payload?.mode),
  [MessageType.EXPORT_CONFIG]: () => rules.exportConfigPayload(),
  [MessageType.RECONCILE]: () => rules.reconcileNow(),
};

export function registerMessaging() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    const handler = handlers[message.type];
    if (!handler) {
      sendResponse({
        ok: false,
        error: { code: ErrorCode.UNKNOWN_MESSAGE, message: message.type },
      });
      return false;
    }

    Promise.resolve()
      .then(() => handler(message.payload || {}, sender))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => {
        console.error('[PagePulse] message failed', message.type, error);
        sendResponse({ ok: false, error: toErrorPayload(error) });
      });

    // Keep the channel open for the async response.
    return true;
  });
}
