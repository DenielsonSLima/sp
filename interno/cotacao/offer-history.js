import { escapeHtml } from '../../shared/ui.js';
import { money, validDate } from './formatting.js';

/** The RPC chooses the historical quotation and computes the price direction. */
export function offerHistoryMarkup(history, { pending = false } = {}) {
  if (!history || !Number.isSafeInteger(history.previousCents) || !validDate(history.quotedOn)) return '';
  const date = history.quotedOn.split('-').reverse().join('/');
  const trend = pending ? 'none' : history.trend;
  const label = trend === 'up' ? 'Preço subiu' : trend === 'down' ? 'Preço baixou' : trend === 'equal' ? 'Preço igual' : '';
  const arrow = trend === 'up' || trend === 'down'
    ? `<svg class="offer-history-arrow is-${trend}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${trend === 'up' ? 'M12 19V5m-6 6 6-6 6 6' : 'M12 5v14m-6-6 6 6 6-6'}"/></svg>`
    : '';
  const description = `Cotado em ${date}${label ? ' · ' + label : ''}`;
  return `<span class="offer-history-value" tabindex="0" title="${escapeHtml(description)}" aria-label="Preço anterior ${escapeHtml(money(history.previousCents))}. ${escapeHtml(description)}">${arrow}<span>Anterior: ${money(history.previousCents)}</span><span class="offer-history-tooltip" aria-hidden="true">${escapeHtml(description)}</span></span>`;
}
