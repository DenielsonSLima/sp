import { heading, escapeHtml as esc } from '../../shared/ui.js';
export { esc };
export const base = '#devolucoes';
export const dateLabel = (value) => value.split('-').reverse().join('/');
export const badge = (status) =>
  `<span class="return-status ${status === 'Parcial' ? 'partial' : status === 'Resolvida' ? 'resolved' : ''}">${status}</span>`;
export const frame = (isList = false) => {
  const title = heading('OPERAÇÃO', 'Devoluções');
  return `<section class="returns">${isList ? `<div class="page-heading-actions">${title}<a class="button primary" href="${base}/nova">+ Nova devolução</a></div>` : title}<div class="return-content"></div></section>`;
};
