import { normalizeSearch } from '../../shared/filters.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { readQuoteSnapshots, quoteSnapshots } from './services.js';
import { validDate } from './formatting.js';
export const quotes = [];
export { readQuotePage as loadQuotePage } from './services.js';
export async function loadQuotes() {
  await readQuoteSnapshots();
  quotes.splice(0, quotes.length, ...quoteSnapshots());
  return quotes;
}
export const getQuote = (id) => quotes.find((q) => q.id === id);
const calculated = (q) => {
  if (!q?.computed) throw Error('O banco não retornou os cálculos desta cotação. Recarregue o registro.');
  return q.computed;
};
export function filterQuotes({ status = 'open', query = '', category = '', start = '', end = '' } = {}) {
  if ((start && !validDate(start)) || (end && !validDate(end))) throw new Error('Informe datas válidas.');
  if (start && end && start > end) throw new Error('A data inicial não pode ser posterior à data final.');
  const needle = normalizeSearch(query);
  return quotes.filter(
    (q) =>
      q.status === status &&
      (!start || q.date >= start) &&
      (!end || q.date <= end) &&
      (!category || q.items.some((i) => i.category === category)) &&
      (!needle ||
        normalizeSearch([q.title, ...q.items.map((i) => i.name), ...q.providers.map((p) => p.name)].join(' ')).includes(
          needle,
        )),
  );
}
export const isProviderFinalized = (q, providerId) => Object.hasOwn(q.finalizedProviders || {}, providerId);
export const isQuoteItemFinalized = (q, itemId) =>
  Object.values(q.finalizedProviders || {}).some((provider) => provider.items.some((item) => item.id === itemId));
export const comparison = (q, itemId) => calculated(q).comparisons[itemId];
export const totals = (q) => calculated(q).totals;
export const selectedTotal = (q) => calculated(q).selectedTotal;
export const awardedByProvider = (q) => calculated(q).awardedByProvider;
export const quoteLineTotal = (q, itemId, providerId) => calculated(q).lineTotals?.[itemId]?.[providerId] ?? null;
clearOnContextChange('quotes', () => {
  quotes.length = 0;
});

import { readQuoteRecord } from './services.js';
export async function loadQuote(id) {
  await readQuoteRecord(id);
  quotes.splice(0, quotes.length, ...quoteSnapshots());
  return getQuote(id);
}
