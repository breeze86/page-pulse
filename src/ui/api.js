/** Thin client for the service worker message API. */

import { MessageType } from '../shared/constants.js';

export async function sendMessage(type, payload) {
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type, payload });
  } catch (error) {
    throw Object.assign(new Error(error?.message || 'message failed'), { code: 'INTERNAL' });
  }

  if (!response) {
    throw Object.assign(new Error('no response from service worker'), { code: 'INTERNAL' });
  }
  if (!response.ok) {
    const details = response.error || {};
    throw Object.assign(new Error(details.message || 'request failed'), {
      code: details.code,
      details,
    });
  }
  return response.data;
}

export const api = {
  getState: () => sendMessage(MessageType.GET_STATE),
  saveRule: (rule) => sendMessage(MessageType.SAVE_RULE, { rule }),
  deleteRule: (id) => sendMessage(MessageType.DELETE_RULE, { id }),
  setRuleEnabled: (id, enabled) => sendMessage(MessageType.SET_RULE_ENABLED, { id, enabled }),
  setGlobalEnabled: (enabled) => sendMessage(MessageType.SET_GLOBAL_ENABLED, { enabled }),
  saveDefaults: (defaults) => sendMessage(MessageType.SAVE_DEFAULTS, defaults),
  refreshNow: (id) => sendMessage(MessageType.REFRESH_NOW, { id }),
  importConfig: (payload, mode) => sendMessage(MessageType.IMPORT_CONFIG, { payload, mode }),
  exportConfig: () => sendMessage(MessageType.EXPORT_CONFIG),
  reconcile: () => sendMessage(MessageType.RECONCILE),
};
