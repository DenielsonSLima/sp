import { createAutosaveQueue } from './autosave.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { hortifrutiRepository as store } from './state.js';

const keys = new Map();
const queue = createAutosaveQueue(({ recordId, productId, patch }) =>
  store.setPricing(recordId, productId, patch), 400);

export function schedulePricingSave(recordId, productId, patch, notify) {
  const key = `${recordId}|${productId}`;
  if (!keys.has(recordId)) keys.set(recordId, new Set());
  keys.get(recordId).add(key);
  queue.schedule(key, { recordId, productId, patch: structuredClone(patch) }, notify);
  return key;
}

export const flushPricingLine = (recordId, productId) => queue.flush(`${recordId}|${productId}`);
export const flushPricingSaves = (recordId) =>
  Promise.all([...(keys.get(recordId) || [])].map((key) => queue.flush(key)));
export const cancelPricingLine = (recordId, productId) => {
  const key = `${recordId}|${productId}`;
  queue.cancel(key);
  keys.get(recordId)?.delete(key);
};

clearOnContextChange('hortifruti_receipts', () => {
  queue.reset();
  keys.clear();
});
