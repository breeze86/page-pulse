/** Small, dependency-free formatting helpers (covered by tests). */

export function splitDuration(totalSec) {
  const sec = Math.max(0, Math.round(Number(totalSec) || 0));
  return {
    hours: Math.floor(sec / 3600),
    minutes: Math.floor((sec % 3600) / 60),
    seconds: sec % 60,
  };
}

/**
 * Human-readable span, e.g. "1 小时 30 分钟" / "2 h".
 *
 * @param {number} totalSec
 * @param {(unit: 'hour'|'minute'|'second') => string} unit
 */
export function formatSpan(totalSec, unit) {
  const { hours, minutes, seconds } = splitDuration(totalSec);
  const parts = [];
  if (hours) parts.push(`${hours} ${unit('hour')}`);
  if (minutes) parts.push(`${minutes} ${unit('minute')}`);
  if (!hours && !minutes) parts.push(`${seconds} ${unit('second')}`);
  return parts.join(' ');
}

/** Countdown as mm:ss, or h:mm:ss past an hour. */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
