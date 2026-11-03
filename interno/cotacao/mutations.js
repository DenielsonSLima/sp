import { runQuoteCommand } from './services.js';
import { quotes } from './queries.js';
async function remoteQuoteAction(q, action, payload) {
  const result = await runQuoteCommand(action, q?.id || null, payload);
  const saved = result.record || result;
  if (q) {
    for (const key of Object.keys(q)) delete q[key];
    Object.assign(q, saved);
  } else quotes.unshift(saved);
  return saved;
}
export const createQuote = (input) => remoteQuoteAction(null, 'create', input);
export const setOffer = (q, itemId, providerId, value) =>
  remoteQuoteAction(q, 'setOffer', { itemId, providerId, value });
export const setQuoteDiscount = (q, providerId, itemId, type, value) =>
  remoteQuoteAction(q, 'setQuoteDiscount', { providerId, itemId, type, value });
export const chooseProvider = (q, itemId, providerId) => remoteQuoteAction(q, 'chooseProvider', { itemId, providerId });
export const finalizeQuote = (q) => remoteQuoteAction(q, 'finalizeQuote', {});
export const finalizeQuoteProvider = (q, providerId) => remoteQuoteAction(q, 'finalizeQuoteProvider', { providerId });
export const updateItemQuantity = (q, itemId, value) => remoteQuoteAction(q, 'updateItemQuantity', { itemId, value });
export const addQuoteProvider = (q, provider) => remoteQuoteAction(q, 'addQuoteProvider', { provider });
export const removeQuoteProvider = (q, providerId, { clearLinked = false } = {}) =>
  remoteQuoteAction(q, 'removeQuoteProvider', { providerId, clearLinked });
export const addQuoteItem = (q, product, quantity) => remoteQuoteAction(q, 'addQuoteItem', { product, quantity });
