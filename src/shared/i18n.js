/**
 * i18n helpers for extension pages.
 *
 * Every user-facing string lives in `_locales/<locale>/messages.json`; this
 * module only adds DOM sugar and a stable mapping from validation codes to
 * message keys.
 */

export function t(key, substitutions) {
  const i18n = globalThis.chrome?.i18n;
  if (!i18n || typeof i18n.getMessage !== 'function') return key;
  return i18n.getMessage(key, substitutions) || key;
}

const ERROR_KEYS = {
  'name.tooLong': 'errNameTooLong',
  'match.type': 'errMatchType',
  'match.required': 'errMatchRequired',
  'match.host': 'errMatchHost',
  'match.glob': 'errMatchGlob',
  'match.regex': 'errMatchRegex',
  'startUrl.invalid': 'errStartUrl',
  'interval.required': 'errIntervalRequired',
  'interval.order': 'errIntervalOrder',
  'interval.range': 'errIntervalRange',
  'limit.reached': 'errLimitReached',
  'storage.failed': 'errStorage',
  'rule.notFound': 'errNotFound',
  'import.invalid': 'errImportInvalid',
};

export function errorMessage(code, substitutions) {
  const key = ERROR_KEYS[code];
  return key ? t(key, substitutions) : t('errUnknown');
}

/** Translate every `data-i18n*` node under `root` (defaults to the document). */
export function applyI18n(root = document) {
  const scope = root?.querySelectorAll ? root : document;

  for (const el of scope.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of scope.querySelectorAll('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  }
  for (const el of scope.querySelectorAll('[data-i18n-title]')) {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  }
  for (const el of scope.querySelectorAll('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  }

  const lang = globalThis.chrome?.i18n?.getUILanguage?.() || 'en';
  document.documentElement.lang = lang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}
