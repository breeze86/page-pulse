/**
 * Low-level, single-writer state storage.
 *
 * All mutations go through one promise chain so read-modify-write cycles from
 * concurrent alarms/messages can never lose an update.
 */

import { APP_VERSION, SCHEMA_VERSION, STORAGE_KEY } from '../shared/constants.js';
import { AppError, ErrorCode } from '../shared/errors.js';
import { createDefaultState, migrateState } from '../shared/state.js';

let writeChain = Promise.resolve();
let initPromise = null;

async function readRaw() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data?.[STORAGE_KEY];
  } catch (error) {
    throw new AppError(ErrorCode.STORAGE_FAILED, String(error?.message || error));
  }
}

async function readStateInternal() {
  const raw = await readRaw();
  if (raw === undefined || raw === null) return createDefaultState();
  return migrateState(raw);
}

/** Read the current state, waiting for any in-flight write to land first. */
export async function getState() {
  await writeChain;
  return readStateInternal();
}

/**
 * Serialised read-modify-write.
 * @param {(state: object) => (object | Promise<object>)} mutator
 */
export function mutateState(mutator) {
  const task = writeChain.then(async () => {
    const state = await readStateInternal();
    const next = (await mutator(state)) || state;
    next.schemaVersion = SCHEMA_VERSION;
    next.meta = { ...(next.meta || {}), updatedAt: Date.now(), appVersion: APP_VERSION };
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
    } catch (error) {
      throw new AppError(ErrorCode.STORAGE_FAILED, String(error?.message || error));
    }
    return next;
  });
  // Keep the chain alive even when a mutation fails.
  writeChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

/** Make sure a first-run state exists; safe to call from every entry point. */
export function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      const raw = await readRaw();
      if (raw !== undefined && raw !== null) return;
      await mutateState((state) => state);
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}
