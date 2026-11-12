/**
 * Error types shared by the service worker and the UI.
 *
 * Codes are stable strings; user-facing text is produced by the i18n layer so
 * that errors can cross the message boundary without losing structure.
 */

export const ErrorCode = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  LIMIT_REACHED: 'LIMIT_REACHED',
  STORAGE_FAILED: 'STORAGE_FAILED',
  UNKNOWN_MESSAGE: 'UNKNOWN_MESSAGE',
  INTERNAL: 'INTERNAL',
});

export class AppError extends Error {
  /**
   * @param {string} code one of ErrorCode
   * @param {string} [message]
   * @param {unknown} [details]
   */
  constructor(code, message, details) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  /** @param {Array<{field: string, code: string}>} errors */
  constructor(errors) {
    super(ErrorCode.VALIDATION_FAILED, 'validation failed', { errors });
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/** Serialise any thrown value into a message-safe payload. */
export function toErrorPayload(error) {
  if (error instanceof ValidationError) {
    return { code: error.code, message: error.message, errors: error.errors };
  }
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return { code: ErrorCode.INTERNAL, message: String(error?.message || error) };
}
