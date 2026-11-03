import { escapeHtml as esc } from '../../../shared/ui.js';
import { FLYER_FORMATS, FLYER_TEMPLATES } from '../generator/options.js';

const optionMarkup = (rows, selected) => rows.map(row =>
  `<option value="${esc(row.id)}" ${row.id === selected ? 'selected' : ''}>${esc(row.name)}</option>`,
).join('');

export function modelCardsMarkup(state) {
  const rows = state.tab === 'mine' ? state.models : state.presets;
  const search = state.query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = rows.filter(row => `${row.title || row.name} ${row.description || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(search));
  if (!filtered.length) return `<div class="card fm-empty"><span aria-hidden="true">▤</span>
    <h2>${state.query ? 'Nenhum modelo encontrado.' : 'Seus modelos ficam aqui.'}</h2>
    <p>${state.query ? 'Tente buscar por outro nome.' : 'Crie um modelo, personalize uma das bases ou importe um modelo salvo.'}</p>
    ${!state.query ? '<button class="button primary" type="button" data-fm-action="create">Criar modelo</button>' : ''}</div>`;
  return filtered.map(row => {
    const ready = state.tab === 'ready', title = row.title || row.name, key = ready ? `preset:${row.id}` : row.id;
    return `<article class="card fm-card" data-fm-card="${esc(key)}">
      <div class="fm-preview" aria-label="Prévia de ${esc(title)}">
        <canvas data-fm-preview="${esc(key)}" aria-label="${esc(title)}, modelo em branco"></canvas>
        <span class="fm-preview-status">Carregando prévia…</span>
        <span class="fm-card-tag">${ready ? 'PRONTO PARA PERSONALIZAR' : 'MEU MODELO'}</span>
      </div>
      <div class="fm-card-body"><h2>${esc(title)}</h2>
        <p>${esc(ready ? row.description : `${row.width} × ${row.height} px · Modelo editável`)}</p>
        <span class="fm-card-slots">Carregando disposição…</span>
        <div class="fm-card-actions">
          <button class="button primary" type="button" data-fm-use="${esc(key)}" ${state.busy ? 'disabled' : ''}>Usar na promoção</button>
          <button class="button secondary" type="button" data-fm-edit="${esc(key)}" ${state.busy ? 'disabled' : ''}>${ready ? 'Personalizar' : 'Editar modelo'}</button>
          ${!ready ? `<button class="fm-duplicate" type="button" data-fm-copy="${esc(key)}" ${state.busy ? 'disabled' : ''}>Duplicar modelo</button>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');
}

export function modelLibraryMarkup(state) {
  return `<section class="fm-library">
    <header class="page-heading fm-heading"><div><span class="eyebrow">OFERTAS E DIVULGAÇÃO</span><h1>Modelos</h1>
      <p>Encartes em branco para dar a sua cara a cada promoção.</p></div>
      <div class="fm-heading-actions"><button class="button secondary" type="button" data-fm-action="import" ${state.busy ? 'disabled' : ''}>Importar modelo</button>
      <button class="button primary" type="button" data-fm-action="create" ${state.busy ? 'disabled' : ''}>+ Criar modelo</button></div>
    </header>
    <div class="fm-toolbar"><div class="module-tabs fm-tabs" role="tablist" aria-label="Biblioteca de modelos">
      <button type="button" role="tab" data-fm-tab="ready" aria-selected="${state.tab === 'ready'}" ${state.busy ? 'disabled' : ''}>Modelos prontos</button>
      <button type="button" role="tab" data-fm-tab="mine" aria-selected="${state.tab === 'mine'}" ${state.busy ? 'disabled' : ''}>Meus modelos <span>${state.models.length}</span></button>
    </div><label class="fm-search"><span class="sr-only">Buscar modelo</span><input type="search" aria-label="Buscar modelo" placeholder="Buscar modelo…" value="${esc(state.query)}" maxlength="100" ${state.busy ? 'disabled' : ''}></label></div>
    <p class="fm-feedback ${state.error ? 'error' : ''}" role="status" aria-live="polite">${esc(state.message)}</p>
    <div class="fm-grid">${modelCardsMarkup(state)}</div>
    <input class="fm-import-file" type="file" accept=".json,application/json,image/png,image/jpeg,image/webp" hidden>
  </section>`;
}

export function modelCreationMarkup(presets) {
  return `<form class="fm-create-form"><header><span class="eyebrow">NOVO MODELO</span><h2>Criar modelo</h2>
    <p>Escolha a base e ajuste tudo no editor.</p></header>
    <label>Nome do modelo<input name="title" placeholder="Ex.: Ofertas de Natal" required maxlength="100" autofocus></label>
    <label>Começar com<select name="presetId">${optionMarkup(presets, 'povo')}</select></label>
    <div class="fm-create-options"><label>Disposição<select name="templateId">${optionMarkup(FLYER_TEMPLATES, 'grid-8')}</select></label>
    <label>Formato<select name="formatId">${optionMarkup(FLYER_FORMATS, 'story')}</select></label></div>
    <label class="fm-background-file">Imagem de fundo <span>Opcional</span><input name="background" type="file" accept="image/png,image/jpeg,image/webp">
      <small>PNG, JPG ou WebP de até 8 MB. Até 4.096 pixels por lado e 16 megapixels.</small></label>
    <label class="fm-background-heading" hidden><input type="checkbox" name="automaticHeading">Adicionar título e validade automáticos sobre a imagem</label>
    <p class="fm-dialog-feedback" role="status" aria-live="polite"></p>
    <footer><button class="button secondary" type="button" data-fm-cancel>Cancelar</button><button class="button primary" type="submit">Abrir editor</button></footer>
  </form>`;
}
