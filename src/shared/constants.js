/**
 * Shared constants for PagePulse.
 *
 * Keep this file free of browser APIs so it can be imported by unit tests and
 * by every extension context.
 */

export const APP_NAME = 'PagePulse';

/** Bump only together with a migration inside `state.js`. */
export const SCHEMA_VERSION = 2;

/** Single storage key: one object, one writer (the service worker). */
export const STORAGE_KEY = 'pagepulse.state.v1';

/** Hard cap keeps us far away from Chrome's 500-alarm limit. */
export const MAX_RULES = 50;
export const MAX_NAME_LENGTH = 60;
export const MAX_REGEX_LENGTH = 500;

/** `chrome.alarms` fires at most once every 30s (Chrome >= 120). */
export const MIN_INTERVAL_SEC = 30;
export const MAX_INTERVAL_SEC = 24 * 60 * 60;

/** 60–120 minutes, as requested for new rules. */
export const DEFAULT_INTERVAL = Object.freeze({ minSec: 60 * 60, maxSec: 120 * 60 });

export const DEFAULT_OPTIONS = Object.freeze({
  skipActive: true,
  skipAudible: true,
  reloadAllTabs: false,
  bypassCache: false,
});

export const MATCH_TYPES = Object.freeze(['host', 'glob', 'regex']);
export const MATCH_TYPE_DEFAULT = 'host';

/** Alarm names are namespaced so we never touch alarms owned by other code. */
export const ALARM_PREFIX = 'pp:rule:';

export const BADGE_PAUSED = '\u23F8';
export const BADGE_COLOR = '#4F46E5';
export const BADGE_COLOR_PAUSED = '#9CA3AF';

/** Message types between extension pages and the service worker. */
export const MessageType = Object.freeze({
  GET_STATE: 'GET_STATE',
  SAVE_RULE: 'SAVE_RULE',
  DELETE_RULE: 'DELETE_RULE',
  SET_RULE_ENABLED: 'SET_RULE_ENABLED',
  SET_GLOBAL_ENABLED: 'SET_GLOBAL_ENABLED',
  SAVE_DEFAULTS: 'SAVE_DEFAULTS',
  REFRESH_NOW: 'REFRESH_NOW',
  IMPORT_CONFIG: 'IMPORT_CONFIG',
  EXPORT_CONFIG: 'EXPORT_CONFIG',
  RECONCILE: 'RECONCILE',
});

/** Rule run outcomes, persisted as short stable codes. */
export const Outcome = Object.freeze({
  RELOADED: 'reloaded',
  OPENED: 'opened',
  SKIPPED: 'skipped',
  NO_TAB: 'no-tab',
  ERROR: 'error',
});
