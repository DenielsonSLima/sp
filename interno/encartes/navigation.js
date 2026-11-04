import { escapeHtml as esc } from '../../shared/ui.js';

const sections = [
  { id: 'create', label: 'Criar encarte', query: '' },
  { id: 'saved', label: 'Encartes salvos', query: 'salvos' },
  { id: 'ready', label: 'Modelos prontos', query: 'modelos' },
  { id: 'mine', label: 'Meus modelos', query: 'meus-modelos' },
];

export function readFlyerSection(hash) {
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const fallback = hash.split('?')[0] === '#modelos' ? 'ready' : 'create';
  return sections.find(section => section.query && section.query === params.get('aba'))?.id || fallback;
}

export function flyerTabsMarkup(active, { busy = false, modelCount, campaignId } = {}) {
  const modelLibrary = ['ready', 'mine'].includes(active);
  return `<div class="module-tabs flyer-module-tabs" role="tablist" aria-label="Encartes">${sections.map(section => {
    const params = new URLSearchParams();
    if (section.query) params.set('aba', section.query);
    if (campaignId) params.set('promocao', campaignId);
    const href = '#encartes' + (params.size ? '?' + params : '');
    const local = modelLibrary === ['ready', 'mine'].includes(section.id);
    const attribute = local ? `data-${modelLibrary ? 'fm' : 'fw'}-tab="${section.id}"` : `data-flyer-href="${esc(href)}"`;
    return `<button type="button" role="tab" ${attribute} aria-selected="${active === section.id}"
      ${busy ? 'disabled' : ''}>${section.label}${section.id === 'mine' && modelCount !== undefined ? ` <span>${modelCount}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

export function bindFlyerNavigation(root) {
  root.querySelectorAll('[data-flyer-href]').forEach(button => {
    button.onclick = () => { location.hash = button.dataset.flyerHref; };
  });
}
