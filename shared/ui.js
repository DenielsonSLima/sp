export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const logo = () =>
  '<div class="brand-logo"><img src="./assets/logo-original.jpg" alt="Supermercado do Povo — Onde o povo faz economia"></div>';
export const heading = (eyebrow, title, description = '') =>
  `<div class="page-heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div>`;
