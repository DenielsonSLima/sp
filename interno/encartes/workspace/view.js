import { escapeHtml as esc } from '../../../shared/ui.js';
import { formatBRLCents } from '../../../shared/components/currency-input/index.js';
import { FLYER_FORMATS, FLYER_TEMPLATES, campaignValidityLabel } from '../generator/index.js';
import { FLYER_MODEL_PRESETS, modelSlotCount } from '../modelos/model.js';
import { productPhotos } from './data.js';

const options = (entries, selected) => entries.map(row => `<option value="${esc(row.id)}" ${selected === row.id ? 'selected' : ''}>${esc(row.name)}</option>`).join('');
export function workspaceMarkup(state) {
  return `<section class="fw-workspace"><header class="page-heading fw-heading"><div><span class="eyebrow">OFERTAS E DIVULGAÇÃO</span><h1>Encartes</h1><p>Escolha um modelo e preencha com sua promoção.</p></div><a class="button secondary" href="#modelos">Biblioteca de modelos →</a></header>
  <div class="module-tabs fw-tabs" role="tablist" aria-label="Encartes"><button role="tab" data-fw-tab="create" aria-selected="${state.tab === 'create'}">Criar encarte</button><button role="tab" data-fw-tab="saved" aria-selected="${state.tab === 'saved'}">Encartes salvos</button></div>
  <p class="fw-feedback ${state.error ? 'error' : ''}" role="status" aria-live="polite">${esc(state.message)}</p>
  <div class="fw-body">${state.tab === 'saved' ? savedMarkup(state) : createMarkup(state)}</div></section>`;
}
function createMarkup(state) {
  const campaign = state.campaign, disabled = state.busy ? 'disabled' : '';
  const custom = !state.modelKey.startsWith('preset:');
  const modelRows = [...FLYER_MODEL_PRESETS.map(row => ({ id: 'preset:' + row.id, name: row.name })), ...state.models.map(row => ({ id: row.id, name: row.title }))];
  return `<div class="fw-layout"><aside class="fw-setup card"><form class="fw-form">
    <label>Promoção<select id="fw-campaign" ${disabled}><option value="">Selecione uma promoção salva</option>${options(state.campaigns, campaign?.id)}</select></label>
    ${!state.campaigns.length && !state.busy ? '<p class="fw-muted">Cadastre uma promoção com produtos para começar.</p><a href="#promocoes">Abrir Promoções →</a>' : ''}
    ${campaign ? `<div class="fw-campaign-info"><strong>${campaign.items.length} produtos</strong><span>${esc(campaignValidityLabel(campaign) || 'Sem validade definida')}</span></div>` : ''}
    <label>Modelo do encarte<select id="fw-model" ${disabled}>${options(modelRows, state.modelKey)}</select></label>
    <div class="fw-model-actions"><a href="#modelos${campaign ? '?promocao=' + encodeURIComponent(campaign.id) : ''}">Ver modelos</a><button class="fw-edit-model" type="button" ${disabled}>Editar modelo</button></div>
    ${custom ? `<p class="fw-model-info">${state.model ? `${modelSlotCount(state.model)} produtos por página · ${state.model.width} × ${state.model.height} px` : 'Modelo personalizado salvo'}</p>` : `<label>Produtos por página<select id="fw-template" ${disabled}>${options(FLYER_TEMPLATES, state.options.templateId)}</select></label><label>Formato<select id="fw-format" ${disabled}>${options(FLYER_FORMATS, state.options.formatId)}</select></label>`}
    <button class="button primary fw-generate" type="submit" ${state.busy || !campaign?.items.length ? 'disabled' : ''}>${state.busy ? 'Preparando…' : state.pages.length ? 'Gerar nova versão' : 'Gerar encarte'}</button>
  </form>${campaign?.items.length ? `<details class="fw-products" ${state.pages.length ? '' : 'open'}><summary>Fotos dos produtos <span>${campaign.items.length}</span></summary><div>${campaign.items.map((item, index) => productMarkup(item, index, state)).join('')}</div></details>` : ''}</aside>
  <section class="fw-preview" aria-label="Prévia do encarte">${previewMarkup(state)}</section></div>`;
}
function productMarkup(item, index, state) {
  const photos = productPhotos(state.products.get(item.productId));
  const selected = state.photoChoices.get(item.productId) || 0, choice = selected < photos.length ? selected : 0;
  return `<article class="fw-product">${photos[choice] ? `<img src="${esc(photos[choice])}" alt="${esc(item.displayName || item.name)}" loading="lazy">` : '<span class="fw-missing-photo">Sem foto</span>'}<div><strong>${esc(item.displayName || item.name)}</strong><span>R$ ${formatBRLCents(item.cents)} · ${esc(item.unit)}</span>${photos.length > 1 ? `<label class="fw-photo-label">Foto<select data-fw-photo="${index}" ${state.busy ? 'disabled' : ''}>${photos.map((_, p) => `<option value="${p}" ${choice === p ? 'selected' : ''}>Foto ${p + 1}</option>`).join('')}</select></label>` : ''}</div></article>`;
}
export function previewMarkup(state) {
  if (!state.pages.length) return `<div class="fw-empty"><span class="fw-empty-icon" aria-hidden="true">▦</span><h2>Seu modelo. Suas ofertas.</h2><p>Escolha a promoção e o modelo para montar as páginas. Depois, ajuste fotos, textos e tamanhos no editor.</p><canvas class="fw-model-canvas" aria-label="Prévia do modelo em branco"></canvas></div>`;
  const page = state.pages[state.pageIndex], disabled = state.busy ? 'disabled' : '';
  return `<header class="fw-preview-heading"><div><h2>${esc(state.campaign?.name || page.title.replace(/ · Página \d+ de \d+$/, ''))}</h2><p>Página ${state.pageIndex + 1} de ${state.pages.length} · ${page.width} × ${page.height} px · ${state.saved ? 'Salvo' : 'Prévia'}</p></div><div class="fw-export-actions"><button class="button primary" data-fw-action="png" ${disabled}>Baixar PNG</button><button class="button secondary" data-fw-action="save" ${disabled}>${state.saved ? 'Salvar alterações' : 'Salvar encarte'}</button></div></header>
  ${state.sourceChanged ? '<p class="fw-notice">A promoção foi alterada. Gere uma nova versão para usar os dados atualizados.</p>' : ''}
  ${state.optionsChanged ? '<p class="fw-notice">Suas opções mudaram. Clique em Gerar nova versão para atualizar a prévia.</p>' : ''}
  <div class="fw-canvas-wrap"><canvas class="fw-canvas" aria-label="Página ${state.pageIndex + 1} do encarte"></canvas></div>
  <footer class="fw-page-controls"><button class="button secondary" data-fw-action="previous" ${state.busy || state.pageIndex === 0 ? 'disabled' : ''} aria-label="Página anterior">←</button><span>Página ${state.pageIndex + 1} de ${state.pages.length}</span><button class="button secondary" data-fw-action="next" ${state.busy || state.pageIndex === state.pages.length - 1 ? 'disabled' : ''} aria-label="Próxima página">→</button><button class="button secondary" data-fw-action="edit" ${disabled}>Editar página</button></footer>`;
}
function savedMarkup(state) {
  if (!state.groups.length) return '<div class="card fw-saved-empty"><h2>Nenhum encarte salvo ainda.</h2><p>Escolha uma promoção e salve seu primeiro encarte.</p><button class="button primary" data-fw-tab="create">Criar encarte</button></div>';
  return `<div class="fw-saved-grid">${state.groups.map(group => `<article class="card fw-saved-card"><span class="fw-saved-icon" aria-hidden="true">▦</span><h2>${esc(group.pages[0].title.replace(/ · Página \d+ de \d+$/, ''))}</h2><p>${group.pages.length} página${group.pages.length > 1 ? 's' : ''}</p><span class="fw-muted">${esc(new Date(group.updatedAt).toLocaleDateString('pt-BR'))}</span><button class="button secondary" data-fw-open="${esc(group.groupId)}" ${state.busy ? 'disabled' : ''}>Abrir encarte →</button></article>`).join('')}</div>`;
}
