import { escapeHtml as esc } from '../../../shared/ui.js';

const categories = [
  { id: 'natal', name: 'Natalina', badge: 'NATAL',
    description: 'Modelos para a ceia, os presentes e as ofertas de Natal.',
    presets: ['natal-ceia', 'natal-presentes', 'natal-semana', 'natal'] },
  { id: 'povo', name: 'Ofertas da semana', badge: 'OFERTAS DO POVO',
    description: 'A identidade do Povo nas promoções do dia a dia.', presets: ['povo'] },
  { id: 'fim-de-ano', name: 'Fim de ano', badge: 'BOAS FESTAS',
    description: 'Encartes para as últimas ofertas do ano e a chegada do Ano Novo.',
    presets: ['fim-de-ano', 'ano-novo'] },
  { id: 'verao', name: 'Verão', badge: 'VERÃO',
    description: 'Cores e ofertas para os dias de sol.', presets: ['verao'] },
  { id: 'hortifruti', name: 'Hortifruti', badge: 'FRESQUINHOS',
    description: 'Modelos para destacar frutas, verduras e legumes.', presets: ['hortifruti'] },
];

const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function modelCategories(presets, query = '', selectedCategory = '') {
  const search = fold(query);
  return categories.filter(category => !selectedCategory || category.id === selectedCategory).map(category => ({
    ...category,
    models: presets.filter(preset => category.presets.includes(preset.id) &&
      fold(`${category.name} ${category.badge} ${preset.name} ${preset.description}`).includes(search)),
  })).filter(category => category.models.length);
}

export function modelCategoriesMarkup(groups, busy) {
  return groups.map(group => `<button class="fm-category-card" type="button" data-fm-category="${esc(group.id)}"
      aria-label="Abrir categoria ${esc(group.name)}" ${busy ? 'disabled' : ''}>
    <span class="fm-category-cover" aria-hidden="true">
      <span class="fm-category-samples" style="--samples: ${Math.min(3, group.models.length)}">
        ${group.models.slice(0, 3).map(model => `<span class="fm-category-sample">
          <canvas data-fm-preview="preset:${esc(model.id)}" data-fm-cover></canvas>
          <span class="fm-preview-status">Carregando prévia…</span>
        </span>`).join('')}
      </span><span class="fm-category-badge">${esc(group.badge)}</span>
    </span>
    <span class="fm-category-info"><span class="fm-category-meta">COLEÇÃO DE MODELOS · ENCARTES</span>
      <strong>${esc(group.name)}</strong><span class="fm-category-description">${esc(group.description)}</span>
      <span class="fm-category-footer"><span>${group.models.length} ${group.models.length === 1 ? 'modelo disponível' : 'modelos disponíveis'}</span>
        <span>Ver modelos <span aria-hidden="true">→</span></span></span>
    </span>
  </button>`).join('');
}
