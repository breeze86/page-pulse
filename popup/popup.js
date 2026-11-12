/** Toolbar popup: quick switches, countdowns and manual refresh. */

import { ALARM_PREFIX } from '../src/shared/constants.js';
import { formatClock } from '../src/shared/format.js';
import { applyI18n, t } from '../src/shared/i18n.js';
import { api } from '../src/ui/api.js';
import { errorText, outcomeLabel } from '../src/ui/labels.js';

const els = {
  status: document.getElementById('global-status'),
  globalToggle: document.getElementById('global-toggle'),
  pausedBanner: document.getElementById('paused-banner'),
  list: document.getElementById('rules'),
  empty: document.getElementById('empty'),
  addSite: document.getElementById('add-site'),
  openSettings: document.getElementById('open-settings'),
  version: document.getElementById('version'),
  toast: document.getElementById('toast'),
};

/** @type {{state: any, runtime: Array<{ruleId: string, dueAt: number|null}>, version: string}|null} */
let model = null;
let dueById = new Map();
let toastTimer = null;
let storageTimer = null;
let busy = false;

applyI18n();
document.title = t('appName');

void start();

async function start() {
  bindEvents();
  await load();
  setInterval(updateCountdowns, 1000);
}

function bindEvents() {
  els.globalToggle.addEventListener('change', () => {
    void toggleGlobal(els.globalToggle.checked);
  });
  els.addSite.addEventListener('click', () => openOptions('#new'));
  els.openSettings.addEventListener('click', () => openOptions(''));

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name?.startsWith(ALARM_PREFIX)) setTimeout(() => void load(), 400);
  });
  chrome.storage.onChanged.addListener(() => {
    clearTimeout(storageTimer);
    storageTimer = setTimeout(() => void load(), 150);
  });
}

async function load() {
  try {
    model = await api.getState();
    dueById = new Map(model.runtime.map((item) => [item.ruleId, item.dueAt]));
    render();
  } catch (error) {
    toast(errorText(error), true);
  }
}

function render() {
  if (!model) return;
  const { state, version } = model;

  els.globalToggle.checked = state.globalEnabled;
  els.status.textContent = state.globalEnabled ? t('popupStatusActive') : t('popupPaused');
  els.pausedBanner.hidden = state.globalEnabled;
  els.version.textContent = `v${version}`;

  els.list.replaceChildren();
  for (const rule of state.rules) {
    els.list.append(renderRule(rule));
  }

  const hasRules = state.rules.length > 0;
  els.list.hidden = !hasRules;
  els.empty.hidden = hasRules;

  updateCountdowns();
}

function renderRule(rule) {
  const item = document.createElement('li');
  item.className = `rule${rule.enabled ? '' : ' is-off'}`;
  item.dataset.id = rule.id;

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'switch';
  toggleLabel.title = t('optionsRuleEnabled');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = rule.enabled;
  toggle.setAttribute('aria-label', `${t('optionsRuleEnabled')}: ${displayName(rule)}`);
  toggle.addEventListener('change', () => {
    void toggleRule(rule.id, toggle.checked);
  });
  const track = document.createElement('span');
  track.className = 'switch-track';
  toggleLabel.append(toggle, track);

  const body = document.createElement('div');
  body.className = 'rule-body';

  const head = document.createElement('div');
  head.className = 'rule-head';
  const name = document.createElement('span');
  name.className = 'rule-name';
  name.textContent = displayName(rule);
  name.title = displayName(rule);
  const matchChip = document.createElement('span');
  matchChip.className = 'chip match';
  matchChip.textContent = rule.match.value;
  matchChip.title = rule.match.value;
  head.append(name, matchChip);

  const meta = document.createElement('div');
  meta.className = 'rule-meta';
  const countdown = document.createElement('span');
  countdown.className = 'countdown';
  countdown.dataset.countdown = 'true';
  meta.append(countdown);

  if (rule.stats.consecutiveMisses >= 3) {
    const warn = document.createElement('span');
    warn.className = 'warn';
    warn.textContent = `· ${t('popupNoMatch')}`;
    meta.append(warn);
  } else if (rule.stats.lastOutcome) {
    const last = document.createElement('span');
    last.textContent = `· ${t('popupLastOutcome', [outcomeLabel(rule.stats.lastOutcome)])}`;
    meta.append(last);
  }

  body.append(head, meta);

  const actions = document.createElement('div');
  actions.className = 'rule-actions';
  actions.append(
    iconButton('refresh', t('popupRefresh'), refreshIcon(), () => void refreshRule(rule)),
    iconButton('edit', t('popupEditRule'), editIcon(), () => openOptions(`#rule=${encodeURIComponent(rule.id)}`)),
    iconButton('delete', t('delete'), deleteIcon(), () => enterDeleteConfirm(item, rule), 'danger'),
  );

  item.append(toggleLabel, body, actions);
  return item;
}

function iconButton(action, label, svg, handler, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = extraClass ? `icon-btn ${extraClass}` : 'icon-btn';
  button.dataset.action = action;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(svg);
  button.addEventListener('click', handler);
  return button;
}

function svgIcon(paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function refreshIcon() {
  return svgIcon(['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6']);
}

function editIcon() {
  return svgIcon(['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z']);
}

function deleteIcon() {
  return svgIcon(['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6']);
}

function displayName(rule) {
  return rule.name || t('unnamedRule');
}

function updateCountdowns() {
  if (!model) return;
  const { state } = model;
  const now = Date.now();

  for (const node of els.list.querySelectorAll('[data-countdown]')) {
    const id = node.closest('.rule')?.dataset.id;
    const rule = state.rules.find((candidate) => candidate.id === id);
    if (!rule) continue;

    if (!state.globalEnabled || !rule.enabled) {
      node.textContent = t('paused');
      node.classList.remove('due');
      continue;
    }

    const dueAt = dueById.get(rule.id);
    if (!dueAt) {
      node.textContent = '—';
      node.classList.remove('due');
      continue;
    }

    const remaining = dueAt - now;
    if (remaining <= 0) {
      node.textContent = t('popupDue');
      node.classList.add('due');
    } else {
      node.textContent = `${t('popupNext')} ${formatClock(remaining)}`;
      node.classList.remove('due');
    }
  }
}

async function toggleGlobal(enabled) {
  if (busy) return;
  busy = true;
  els.globalToggle.disabled = true;
  try {
    await api.setGlobalEnabled(enabled);
    await load();
    toast(t('optionsSaved'));
  } catch (error) {
    els.globalToggle.checked = !enabled;
    toast(errorText(error), true);
  } finally {
    busy = false;
    els.globalToggle.disabled = false;
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
    toast(summarise(result));
    await load();
  } catch (error) {
    toast(errorText(error), true);
  }
}

function enterDeleteConfirm(item, rule) {
  item.classList.add('is-confirming');
  item.replaceChildren();

  const text = document.createElement('span');
  text.className = 'rule-confirm-text';
  text.textContent = t('popupConfirmDelete', [displayName(rule)]);

  const actions = document.createElement('div');
  actions.className = 'rule-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn small';
  cancel.textContent = t('cancel');
  cancel.addEventListener('click', () => render());

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'btn small danger';
  confirm.textContent = t('delete');
  confirm.addEventListener('click', () => {
    void deleteRule(rule);
  });

  actions.append(cancel, confirm);
  item.append(text, actions);
  confirm.focus();
}

async function deleteRule(rule) {
  try {
    await api.deleteRule(rule.id);
    toast(t('popupDeleted'));
    await load();
  } catch (error) {
    toast(errorText(error), true);
    await load();
  }
}

function summarise(result) {
  const parts = [];
  if (result.reloaded?.length) parts.push(t('popupRefreshed', [String(result.reloaded.length)]));
  if (result.openedTabId != null) parts.push(t('popupOpened'));
  if (result.skipped?.length) parts.push(t('popupSkipped', [String(result.skipped.length)]));
  return parts.length > 0 ? parts.join(' · ') : t('outcomeNoTab');
}

function openOptions(hash) {
  const base = chrome.runtime.getURL('options/options.html');
  void chrome.tabs.create({ url: hash ? `${base}${hash}` : base });
  window.close();
}

function toast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('error', isError);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}
