import { escapeHtml, heading } from '../../shared/ui.js';
export { escapeHtml as esc, heading };
export { money, today, summary } from './model.js';
export const dateLabel = (value) => value.split('-').reverse().join('/');
export const base = '#hortifruti';
export const badge = (status) =>
  `<span class="hf-badge ${status === 'finished' ? 'hf-green' : ''}">${status === 'finished' ? 'Finalizada' : 'Pendente'}</span>`;
