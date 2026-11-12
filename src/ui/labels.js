/** UI label helpers shared by the popup and the options page. */

import { Outcome } from '../shared/constants.js';
import { formatSpan } from '../shared/format.js';
import { errorMessage, t } from '../shared/i18n.js';

const UNIT_KEYS = { hour: 'durationHour', minute: 'durationMinute', second: 'durationSecond' };

/** "1 小时 – 2 小时" style label for a random range. */
export function intervalLabel(minSec, maxSec) {
  const unit = (name) => t(UNIT_KEYS[name]);
  return t('durationRange', [formatSpan(minSec, unit), formatSpan(maxSec, unit)]);
}

export function outcomeLabel(code) {
  switch (code) {
    case Outcome.RELOADED:
      return t('outcomeReloaded');
    case Outcome.OPENED:
      return t('outcomeOpened');
    case Outcome.SKIPPED:
      return t('outcomeSkipped');
    case Outcome.NO_TAB:
      return t('outcomeNoTab');
    default:
      return t('outcomeError');
  }
}

/** Turn an API error (with structured details) into a localised sentence. */
export function errorText(error) {
  const first = error?.details?.errors?.[0] || error?.errors?.[0];
  if (first?.code) return errorMessage(first.code);

  switch (error?.code) {
    case 'LIMIT_REACHED':
      return errorMessage('limit.reached', [String(error?.details?.limit ?? 50)]);
    case 'RULE_NOT_FOUND':
      return errorMessage('rule.notFound');
    case 'STORAGE_FAILED':
      return errorMessage('storage.failed');
    default:
      return error?.message || t('errUnknown');
  }
}

export function formatTimestamp(ts) {
  if (!ts) return t('optionsNeverRun');
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}
