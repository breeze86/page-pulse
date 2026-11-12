/** Options page: rule CRUD, defaults, import/export and diagnostics. */

import { ALARM_PREFIX } from '../src/shared/constants.js';
import { formatClock } from '../src/shared/format.js';
import { applyI18n, errorMessage, t } from '../src/shared/i18n.js';
import { resolveOpenUrl } from '../src/shared/tab-decision.js';
import { api } from '../src/ui/api.js';
import { errorText, formatTimestamp, intervalLabel, outcomeLabel } from '../src/ui/labels.js';

const els = {
  version: document.getElementById('version'),
  footerVersion: document.getElementById('footer-version'),
  global: document.getElementById('global-enabled'),
  ruleCount: document.getElementById('rule-count'),
  addRule: document.getElementById('add-rule'),
  rules: document.getElementById('rules'),
  empty: document.getElementById('rules-empty'),
  defaultMin: document.getElementById('default-min'),
  defaultMax: document.getElementById('default-max'),
  defaultPreview: document.getElementById('default-preview'),
  defaultOptions: document.getElementById('default-options'),
  saveDefaults: document.getElementById('save-defaults'),
  importMode: document.getElementById('import-mode'),
  importFile: document.getElementById('import-file'),
  importBtn: document.getElementById('import-btn'),
  exportBtn: document.getElementById('export-btn'),
  dialog: document.getElementById('rule-dialog'),
  dialogTitle: document.getElementById('dialog-title'),
  form: document.getElementById('rule-form'),
  name: document.getElementById('rule-name'),
  matchType: document.getElementById('match-type'),
  matchValue: document.getElementById('match-value'),
  matchHint: document.getElementById('match-hint'),
  startUrl: document.getElementById('start-url'),
  startUrlWarning: document.getElementById('start-url-warning'),
  intervalMin: document.getElementById('interval-min'),
  intervalMax: document.getElementById('interval-max'),
  intervalPreview: document.getElementById('interval-preview'),
  skipActive: document.getElementById('opt-skip-active'),
  skipAudible: document.getElementById('opt-skip-audible'),
  reloadAll: document.getElementById('opt-reload-all'),
  bypassCache: document.getElementById('opt-bypass-cache'),
  ruleEnabled: document.getElementById('rule-enabled'),
  formError: document.getElementById('form-error'),
  saveButton: document.querySelector('#rule-form button[type="submit"]'),
  cancel: document.getElementById('cancel-rule'),
  toast: document.getElementById('toast'),
};

const MATCH_PLACEHOLDERS = {
  host: 'optionsMatchHostPlaceholder',
  glob: 'optionsMatchGlobPlaceholder',
  regex: 'optionsMatchRegexPlaceholder',
};

const MATCH_HINTS = {
  host: 'optionsMatchHostHint',
  glob: 'optionsMatchGlobHint',
  regex: 'optionsMatchRegexHint',
};

/** @type {any} */
let model = null;
let dueById = new Map();
let editingId = null;
let defaultsDirty = false;
let toastTimer = null;
let storageTimer = null;

applyI18n();
document.title = `${t('optionsTitle')} · PagePulse`;
bindEvents();
void load().then(handleHash);
setInterval(updateCountdowns, 1000);

function bindEvents() {
  els.global.addEventListener('change', () => {
    void toggleGlobal(els.global.checked);
  });

  els.addRule.addEventListener('click', () => openDialog(null));

  els.defaultMin.addEventListener('input', () => {
    defaultsDirty = true;
    updateDefaultPreview();
  });
  els.defaultMax.addEventListener('input', () => {
    defaultsDirty = true;
    updateDefaultPreview();
  });
  els.defaultOptions.addEventListener('change', () => {
    defaultsDirty = true;
  });
  els.saveDefaults.addEventListener('click', () => {
    void saveDefaults();
  });

  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', () => {
    void importConfig();
  });
  els.exportBtn.addEventListener('click', () => {
    void exportConfig();
  });

  els.matchType.addEventListener('change', updateMatchUi);
  els.startUrl.addEventListener('input', updateMatchUi);
  els.intervalMin.addEventListener('input', updateIntervalPreview);
  els.intervalMax.addEventListener('input', updateIntervalPreview);

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveRule();
  });
  els.cancel.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('close', () => {
    editingId = null;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });

  window.addEventListener('hashchange', () => {
    void handleHash();
  });

  chrome.storage.onChanged.addListener(() => {
    clearTimeout(storageTimer);
    storageTimer = setTimeout(() => void load(), 200);
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name?.startsWith(ALARM_PREFIX)) setTimeout(() => void load(), 400);
  });
}

async function load() {
  try {
    model = await api.getState();
    dueById = new Map(model.runtime.map((item) => [item.ruleId, item.dueAt]));
    renderAll();
  } catch (error) {
    toast(errorText(error), true);
  }
}

function renderAll() {
  if (!model) return;
  const { state, maxRules } = model;

  els.version.textContent = `v${chrome.runtime.getManifest().version}`;
  els.footerVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  els.global.checked = state.globalEnabled;

  els.ruleCount.textContent = t('popupRuleCount', [String(state.rules.length)]);
  const atLimit = state.rules.length >= maxRules;
  els.addRule.disabled = atLimit;
  els.addRule.title = atLimit ? errorMessage('limit.reached', [String(maxRules)]) : '';

  renderRules();
  renderDefaults();
}

function renderRules() {
  if (!model) return;
  els.rules.replaceChildren();
  for (const rule of model.state.rules) {
    els.rules.append(renderCard(rule));
  }
  els.empty.hidden = model.state.rules.length > 0;
  updateCountdowns();
}

function renderDefaults() {
  if (!model || defaultsDirty) return;
  const defaults = model.state.settings.defaults;
  els.defaultMin.value = String(defaults.interval.minSec);
  els.defaultMax.value = String(defaults.interval.maxSec);
  for (const input of els.defaultOptions.querySelectorAll('[data-option]')) {
    input.checked = Boolean(defaults.options[input.dataset.option]);
  }
  updateDefaultPreview();
}

function renderCard(rule) {
  const card = document.createElement('article');
  card.className = `rule-card${rule.enabled ? '' : ' is-off'}`;
  card.dataset.id = rule.id;

  const top = document.createElement('div');
  top.className = 'card-top';

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'switch';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = rule.enabled;
  toggle.setAttribute('aria-label', `${t('optionsRuleEnabled')}: ${displayName(rule)}`);
  toggle.addEventListener('change', () => void toggleRule(rule.id, toggle.checked));
  const track = document.createElement('span');
  track.className = 'switch-track';
  toggleLabel.append(toggle, track);

  const info = document.createElement('div');
  info.className = 'card-info';
  const title = document.createElement('h3');
  title.textContent = displayName(rule);
  title.title = displayName(rule);
  const meta = document.createElement('p');
  meta.className = 'muted card-meta';
  meta.textContent = `${rule.match.value} · ${intervalLabel(rule.interval.minSec, rule.interval.maxSec)}`;
  info.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.append(
    actionButton(t('refreshNow'), 'refresh', () => void refreshRule(rule)),
    actionButton(t('edit'), 'edit', () => openDialog(rule)),
    actionButton(t('delete'), 'delete', 'danger', () => void removeRule(rule)),
  );

  top.append(toggleLabel, info, actions);

  const chips = document.createElement('div');
  chips.className = 'chips';
  const chipLabels = [];
  if (rule.startUrl) chipLabels.push(t('chipStartUrl'));
  if (rule.options.skipActive) chipLabels.push(t('chipSkipActive'));
  if (rule.options.skipAudible) chipLabels.push(t('chipSkipAudible'));
  if (rule.options.reloadAllTabs) chipLabels.push(t('chipAllTabs'));
  if (rule.options.bypassCache) chipLabels.push(t('chipBypassCache'));
  for (const label of chipLabels) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = label;
    chips.append(chip);
  }

  const status = document.createElement('div');
  status.className = 'card-status';
  const countdown = document.createElement('span');
  countdown.dataset.countdown = 'true';
  status.append(countdown);
  status.append(separator(), document.createTextNode(statsText(rule)));

  if (rule.stats.consecutiveMisses >= 3) {
    status.append(separator(), warnSpan(t('popupNoMatch')));
  } else if (rule.stats.lastOutcome) {
    status.append(separator(), document.createTextNode(t('popupLastOutcome', [outcomeLabel(rule.stats.lastOutcome)])));
  }

  card.append(top, chips, status);
  return card;
}

function actionButton(label, action, classNameOrHandler, maybeHandler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn small';
  button.dataset.action = action;
  button.textContent = label;
  if (typeof classNameOrHandler === 'function') {
    button.addEventListener('click', classNameOrHandler);
  } else {
    if (classNameOrHandler) button.classList.add(classNameOrHandler);
    button.addEventListener('click', maybeHandler);
  }
  return button;
}

function separator() {
  const dot = document.createElement('span');
  dot.textContent = '·';
  return dot;
}

function warnSpan(text) {
  const span = document.createElement('span');
  span.className = 'warn';
  span.textContent = text;
  return span;
}

function statsText(rule) {
  return t('optionsStats', [String(rule.stats.refreshCount), formatTimestamp(rule.stats.lastRunAt)]);
}

function displayName(rule) {
  return rule.name || t('unnamedRule');
}

function updateCountdowns() {
  if (!model) return;
  const now = Date.now();
  const { state } = model;

  for (const node of els.rules.querySelectorAll('[data-countdown]')) {
    const ruleId = node.closest('[data-id]')?.dataset.id;
    const rule = state.rules.find((candidate) => candidate.id === ruleId);
    if (!rule) continue;

    if (!state.globalEnabled || !rule.enabled) {
      node.textContent = t('paused');
      node.classList.remove('due');
      continue;
    }

    const dueAt = dueById.get(ruleId);
    if (!dueAt) {
      node.textContent = '';
      node.classList.remove('due');
      continue;
    }

    const remaining = dueAt - now;
    node.textContent = remaining <= 0 ? t('popupDue') : t('optionsNextRun', [formatClock(remaining)]);
    node.classList.toggle('due', remaining <= 0);
  }
}

async function toggleGlobal(enabled) {
  try {
    await api.setGlobalEnabled(enabled);
    await load();
    toast(t('optionsSaved'));
  } catch (error) {
    toast(errorText(error), true);
    els.global.checked = !enabled;
  }
}

async function toggleRule(id, enabled) {
  try {
    await api.setRuleEnabled(id, enabled);
    await load();
  } catch (error) {
    toast(errorText(error), true);
    await load();
  }
}

async function refreshRule(rule) {
  try {
    const result = await api.refreshNow(rule.id);
    toast(summariseRefresh(result));
    await load();
  } catch (error) {
    toast(errorText(error), true);
  }
}

function summariseRefresh(result) {
  const parts = [];
  if (result.reloaded?.length) parts.push(t('popupRefreshed', [String(result.reloaded.length)]));
  if (result.openedTabId != null) parts.push(t('popupOpened'));
  if (result.skipped?.length) parts.push(t('popupSkipped', [String(result.skipped.length)]));
  return parts.length > 0 ? parts.join(' · ') : t('outcomeNoTab');
}

async function removeRule(rule) {
  if (!window.confirm(t('confirmDelete', [displayName(rule)]))) return;
  try {
    await api.deleteRule(rule.id);
    await load();
  } catch (error) {
    toast(errorText(error), true);
  }
}

function updateDefaultPreview() {
  const min = Number(els.defaultMin.value);
  const max = Number(els.defaultMax.value);
  els.defaultPreview.textContent =
    Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0
      ? t('optionsIntervalPreview', [intervalLabel(min, max)])
      : '';
}

function updateIntervalPreview() {
  const min = Number(els.intervalMin.value);
  const max = Number(els.intervalMax.value);
  els.intervalPreview.textContent =
    Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0
      ? t('optionsIntervalPreview', [intervalLabel(min, max)])
      : '';
}

function updateMatchUi() {
  const type = els.matchType.value;
  els.matchValue.placeholder = t(MATCH_PLACEHOLDERS[type]);
  els.matchHint.textContent = t(MATCH_HINTS[type]);

  const derived = resolveOpenUrl({
    startUrl: '',
    match: { type, value: els.matchValue.value.trim() },
  });
  els.startUrlWarning.hidden = Boolean(els.startUrl.value.trim() || derived);
}

async function saveDefaults() {
  const payload = {
    interval: { minSec: els.defaultMin.value, maxSec: els.defaultMax.value },
    options: defaultOptionsState(),
  };
  try {
    await api.saveDefaults(payload);
    defaultsDirty = false;
    toast(t('optionsSaved'));
    await load();
  } catch (error) {
    toast(errorText(error), true);
  }
}

function defaultOptionsState() {
  const options = {};
  for (const input of els.defaultOptions.querySelectorAll('[data-option]')) {
    options[input.dataset.option] = input.checked;
  }
  return options;
}

function openDialog(rule) {
  if (!model) return;
  editingId = rule?.id ?? null;
  const defaults = model.state.settings.defaults;

  els.dialogTitle.textContent = rule ? t('optionsEditRule') : t('optionsNewRule');
  els.name.value = rule?.name ?? '';
  els.matchType.value = rule?.match.type ?? 'host';
  els.matchValue.value = rule?.match.value ?? '';
  els.startUrl.value = rule?.startUrl ?? '';
  els.intervalMin.value = String(rule?.interval.minSec ?? defaults.interval.minSec);
  els.intervalMax.value = String(rule?.interval.maxSec ?? defaults.interval.maxSec);
  els.skipActive.checked = rule?.options.skipActive ?? defaults.options.skipActive;
  els.skipAudible.checked = rule?.options.skipAudible ?? defaults.options.skipAudible;
  els.reloadAll.checked = rule?.options.reloadAllTabs ?? defaults.options.reloadAllTabs;
  els.bypassCache.checked = rule?.options.bypassCache ?? defaults.options.bypassCache;
  els.ruleEnabled.checked = rule?.enabled ?? true;
  els.formError.hidden = true;
  els.formError.textContent = '';

  updateMatchUi();
  updateIntervalPreview();

  if (!els.dialog.open) els.dialog.showModal();
  els.name.focus();
}

async function saveRule() {
  const draft = {
    name: els.name.value,
    enabled: els.ruleEnabled.checked,
    match: { type: els.matchType.value, value: els.matchValue.value },
    startUrl: els.startUrl.value,
    interval: { minSec: els.intervalMin.value, maxSec: els.intervalMax.value },
    options: {
      skipActive: els.skipActive.checked,
      skipAudible: els.skipAudible.checked,
      reloadAllTabs: els.reloadAll.checked,
      bypassCache: els.bypassCache.checked,
    },
  };
  if (editingId) draft.id = editingId;

  els.saveButton.disabled = true;
  try {
    await api.saveRule(draft);
    els.dialog.close();
    toast(t('optionsRuleSaved'));
    await load();
  } catch (error) {
    els.formError.textContent = errorText(error);
    els.formError.hidden = false;
  } finally {
    els.saveButton.disabled = false;
  }
}

async function importConfig() {
  const file = els.importFile.files?.[0];
  els.importFile.value = '';
  if (!file) return;

  let text;
  try {
    text = await file.text();
  } catch (error) {
    toast(errorText(error), true);
    return;
  }

  try {
    const result = await api.importConfig(text, els.importMode.value);
    toast(t('optionsImportDone', [String(result.import.imported)]));
    await load();
  } catch (error) {
    toast(t('optionsImportError', [errorText(error)]), true);
  }
}

async function exportConfig() {
  try {
    const payload = await api.exportConfig();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pagepulse-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('optionsExportDone'));
  } catch (error) {
    toast(errorText(error), true);
  }
}

async function handleHash() {
  const hash = location.hash;
  if (!hash || !model) return;

  if (hash === '#new') {
    openDialog(null);
  } else if (hash.startsWith('#rule=')) {
    const id = decodeURIComponent(hash.slice('#rule='.length));
    const rule = model.state.rules.find((candidate) => candidate.id === id);
    if (rule) openDialog(rule);
  }

  history.replaceState(null, '', location.pathname + location.search);
}

function toast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('error', isError);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3600);
}
