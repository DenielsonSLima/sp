import { getDataContext } from '../../shared/data/api.js';
import { formatWeightMicros } from './weight-input.js';
import { readProductCatalog, readProductPreviews } from './services.js';
import { loadTemplates } from '../cadastros/modelos-cartaz/model.js';
import { partners } from '../cadastros/parceiros/state.js';
import { units } from '../cadastros/unidades/state.js';
import { isPhotoData } from '../cadastros/produtos/photo.js';
import { hortifrutiRepository as store } from './state.js';
import { lineInput, formatDecimal, money } from './model.js';
import { esc, base, badge, dateLabel } from './common.js';
import { getDraft, clearDraft } from './drafts.js';
import { openProductPicker } from './product-picker.js';
import { renderOperations } from './operations.js';
import { renderPricing, removePricingDraftProduct, flushPricingSaves } from './pricing.js';
import { createAutosaveQueue } from './autosave.js';
import { previewOrder } from './printing.js';
const auto = createAutosaveQueue(({ id, draft, catalog, companyId }) => {
  if (companyId !== getDataContext()?.companyId) throw Error('A empresa ativa mudou. Abra o pedido novamente.');
  return store.autosave(id, draft, catalog);
});
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => auto.flushAll());
const autosaveErrors = new Map();
const tabs = new Map();
const renderVersions = new WeakMap();
function headerForm(draft, { create = false, locked = false } = {}) {
  return `<form class="hf-header-form"><fieldset ${locked ? 'disabled' : ''}><legend class="visually-hidden">Cabeçalho do pedido</legend><div class="hf-fields"><label>Parceiro<select name="partnerId" required data-searchable="true"><option value="">Selecione um parceiro</option>${partners.map((p) => `<option value="${esc(p.id)}" ${draft.partnerId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label>Data do pedido<input type="date" name="date" required value="${esc(draft.date)}"></label><label class="hf-wide">Anotações<textarea name="notes" maxlength="2000" placeholder="Informações sobre a compra">${esc(draft.notes)}</textarea></label></div>${create ? `<div class="hf-actions"><button class="button primary" type="submit">Criar pedido</button><a class="button secondary" data-discard href="${base}">Descartar</a></div>` : ''}</fieldset><p class="hf-error" role="alert"></p></form>`;
}
function connectHeader(root, key, draft, onSave, onChange) {
  const form = root.querySelector('.hf-header-form');
  let saving = false;
  form.querySelectorAll('[name]').forEach((el) =>
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      draft[el.name] = el.value;
      onChange?.();
    }),
  );
  root.querySelector('[data-discard]')?.addEventListener('click', () => clearDraft(key));
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const submit = form.querySelector('[type=submit]');
    if (submit) submit.disabled = true;
    try {
      await onSave();
    } catch (e) {
      if (form.isConnected) {
        form.querySelector('.hf-error').textContent = e.message;
        if (submit) submit.disabled = false;
      }
      saving = false;
    } finally {
      if (!submit) saving = false;
    }
  };
}
export async function renderDetail(root, key) {
  void auto.flush(key);
  void flushPricingSaves(key);
  const version = (renderVersions.get(root) || 0) + 1;
  renderVersions.set(root, version);
  let record = null;
  if (key !== 'nova') {
    try {
      record = store.get(key);
    } catch {
      root.innerHTML = `<section class="card hf-empty"><h2>Pedido não encontrado</h2><a href="${base}" class="button secondary">Voltar para a lista</a></section>`;
      return;
    }
  }
  const products = [];
  let catalogRequest;
  const loadProducts = () =>
    (catalogRequest ??= readProductCatalog()
      .then((rows) => {
        products.splice(0, products.length, ...rows);
        return products;
      })
      .catch((error) => {
        catalogRequest = null;
        throw error;
      }));
  if (!root.isConnected || renderVersions.get(root) !== version) return;
  const catalog = { products, partners, units },
    draft = getDraft(key, record),
    locked = record?.status === 'finished';
  if (!record) {
    root.innerHTML = `<nav class="hf-breadcrumb" aria-label="Navegação do pedido"><a href="${base}">Hortifruti</a><span aria-hidden="true">›</span><strong>Novo pedido</strong></nav><section class="card hf-form"><h2>Novo pedido</h2><p class="hf-help">Preencha apenas o cabeçalho. Depois de salvar, selecione os produtos do pedido.</p>${headerForm(draft, { create: true })}</section>`;
    connectHeader(root, key, draft, async () => {
      const r = await store.create({ ...draft, items: [] }, catalog);
      clearDraft(key);
      tabs.set(r.id, 'products');
      location.hash = `${base}/${r.id}`;
    });
    return;
  }
  const selectedTab = tabs.get(key) || 'products';
  root.innerHTML = `<nav class="hf-breadcrumb" aria-label="Navegação do pedido"><a href="${base}">Hortifruti</a><span aria-hidden="true">›</span><strong>${esc(record.partner.name)}</strong></nav><div class="hf-toolbar hf-order-heading"><div><h2>${esc(record.partner.name)}</h2><p>${dateLabel(record.date)}${record.notes ? ' · ' + esc(record.notes) : ''}</p></div><div class="hf-header-actions">${badge(record.status)}<button class="button secondary" data-report type="button">PDF do pedido</button><button class="button secondary" data-lifecycle type="button">${locked ? 'Reabrir compra' : 'Finalizar compra'}</button></div></div>${!locked ? `<details class="card hf-header-details"><summary>Editar cabeçalho do pedido</summary>${headerForm(draft)}</details>` : ''}<p class="hf-autosave-status" data-autosave-status role="status" aria-live="polite">${locked ? '' : 'Alterações salvas automaticamente'}</p><div class="hf-workspace-panel"><div class="hf-detail-tabs module-tabs" role="tablist" aria-label="Áreas do pedido">${[
    ['products', 'Produtos'],
    ['weights', 'Pesagem'],
    ['costs', 'Custos'],
    ['pricing', 'Precificação'],
    ['history', 'Histórico'],
  ]
    .map(
      ([value, label]) =>
        `<button class="button secondary" type="button" role="tab" id="hf-tab-${value}" aria-controls="hf-tabpanel" aria-selected="${value === selectedTab}" tabindex="${value === selectedTab ? '0' : '-1'}" data-tab="${value}">${label}</button>`,
    )
    .join(
      '',
    )}</div><section id="hf-tabpanel" role="tabpanel" aria-labelledby="hf-tab-${selectedTab}" tabindex="0"></section><p class="hf-page-error" role="alert"></p></div>${locked ? `<p class="hf-closed-note">Compra finalizada${record.completedWithPending ? ' com dados pendentes' : ''}. Você pode reabrir para ajustar pesos e custos. A Precificação continua disponível.</p>` : ''}`;
  const panel = root.querySelector('#hf-tabpanel'),
    pageError = (message) => (root.querySelector('.hf-page-error').textContent = message);
  const refresh = () => renderDetail(root, key);
  const schedule = () => {
    if (locked) return;
    const status = root.querySelector('[data-autosave-status]');
    if (status) status.textContent = 'Salvando…';
    autosaveErrors.delete(key);
    auto.schedule(key, { id: key, draft, catalog, companyId: getDataContext()?.companyId }, (error, result) => {
      if (error) autosaveErrors.set(key, error.message);
      else autosaveErrors.delete(key);
      if (!root.isConnected) return;
      const currentStatus = root.querySelector('[data-autosave-status]');
      if (currentStatus)
        currentStatus.textContent = error
          ? error.message
          : result.errors.length
            ? 'Dados válidos salvos. Corrija os campos indicados.'
            : 'Alterações salvas';
      const headerError = root.querySelector('.hf-header-form .hf-error');
      if (headerError)
        headerError.textContent = (result?.errors || [])
          .filter((message) => message === 'Selecione um parceiro válido.' || message === 'Informe uma data válida.')
          .join(' ');
    });
  };
  if (auto.pending(key)) root.querySelector('[data-autosave-status]').textContent = 'Salvando…';
  if (!locked) {
    connectHeader(
      root,
      key,
      draft,
      () => {
        schedule();
        auto.flush(key);
      },
      schedule,
    );
    const errors = [];
    if (errors.length) {
      root.querySelector('[data-autosave-status]').textContent = 'Dados válidos salvos. Corrija os campos indicados.';
      root.querySelector('.hf-header-form .hf-error').textContent = errors
        .filter((message) => message === 'Selecione um parceiro válido.' || message === 'Informe uma data válida.')
        .join(' ');
    }
  }
  const tabButtons = [...root.querySelectorAll('[data-tab]')];
  tabButtons.forEach((button, index) => {
    button.onclick = () => {
      tabs.set(key, button.dataset.tab);
      refresh().then(() => {
        const active = root.querySelector(`[data-tab="${tabs.get(key)}"]`);
        active?.focus({ preventScroll: true });
        active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    };
    button.onkeydown = (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabButtons.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabButtons.length) % tabButtons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabButtons.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        tabs.set(key, tabButtons[next].dataset.tab);
        refresh().then(() => {
          const active = root.querySelector(`[data-tab="${tabs.get(key)}"]`);
          active?.focus({ preventScroll: true });
          active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
      }
    };
  });
  if (selectedTab === 'products') {
    panel.innerHTML = `<div class="hf-toolbar"><div><h2>Produtos selecionados</h2><p>Escolha os produtos; peso e preço podem ser preenchidos em qualquer momento.</p></div>${!locked ? '<button class="button primary" data-add-products type="button">+ Adicionar produtos</button>' : ''}</div><div class="hf-selected-grid hf-selected-lines" role="list" aria-label="Produtos em ordem">${record.items.length ? record.items.map((i, index) => `<article class="card hf-selected-card hf-selected-line" role="listitem"><span class="hf-selected-number" aria-label="Item ${index + 1}">${index + 1}</span>${i.photo && isPhotoData(i.photo) ? `<img class="hf-selected-photo" src="${esc(i.photo)}" alt="${esc(i.name)}">` : '<div class="hf-selected-photo hf-photo-placeholder">Sem foto</div>'}<h3>${esc(i.name)}</h3><p class="hf-selected-weight">Peso líquido: ${i.quantityMicros ? formatWeightMicros(i.quantityMicros) + ' kg' : 'a pesar'}</p><p class="hf-selected-cost">Total de custo: ${money(i.totalCents)}</p>${!locked ? `<button class="button secondary" type="button" data-remove-product="${esc(i.productId)}">Remover produto</button><p class="hf-help" data-remove-note hidden></p>` : ''}</article>`).join('') : '<section class="card hf-empty"><h3>O pedido está criado</h3><p>Adicione produtos e use as abas na ordem que preferir.</p></section>'}</div>`;
    panel.querySelectorAll('[data-remove-product]').forEach(
      (button) =>
        (button.onclick = async () => {
          if (!button.dataset.confirm) {
            button.dataset.confirm = 'yes';
            button.textContent = 'Confirmar remoção';
            const note = button.parentElement.querySelector('[data-remove-note]');
            note.hidden = false;
            note.textContent = 'Remove este produto, suas pesagens e sua precificação do pedido.';
            return;
          }
          try {
            const productId = button.dataset.removeProduct;
            button.disabled = true;
            await auto.flush(key);
            if (autosaveErrors.has(key)) throw Error(autosaveErrors.get(key));
            await store.removeProduct(key, productId);
            record = store.get(key);
            draft.items = draft.items.filter((item) => item.productId !== productId);
            removePricingDraftProduct(key, productId);
            const card = button.closest('.hf-selected-line');
            card.remove();
            panel.querySelectorAll('.hf-selected-line').forEach((line, index) => {
              const number = line.querySelector('.hf-selected-number');
              number.textContent = String(index + 1);
              number.setAttribute('aria-label', 'Item ' + (index + 1));
              const item = record.items.find(
                (item) => item.productId === line.querySelector('[data-remove-product]')?.dataset.removeProduct,
              );
              if (item)
                line.querySelector('.hf-selected-cost').textContent = 'Total de custo: ' + money(item.totalCents);
            });
            if (!record.items.length)
              panel.querySelector('.hf-selected-grid').innerHTML =
                '<section class="card hf-empty"><h3>O pedido está criado</h3><p>Adicione produtos e use as abas na ordem que preferir.</p></section>';
            panel.querySelector('[data-add-products]')?.focus({ preventScroll: true });
          } catch (e) {
            pageError(e.message);
            if (button.isConnected) button.disabled = false;
          }
        }),
    );
    panel.querySelector('[data-add-products]')?.addEventListener('click', async (event) => {
      const trigger = event.currentTarget;
      trigger.disabled = true;
      try {
        await loadProducts();
        if (!trigger.isConnected) return;
        openProductPicker(
          root,
          products,
          record.items.map((i) => i.productId),
          async (ids) => {
            const r = await store.addProducts(key, ids, catalog);
            const known = new Set(draft.items.map((i) => i.productId));
            draft.items.push(...r.items.filter((i) => !known.has(i.productId)).map(lineInput));
            refresh();
          },
          trigger,
          { loadPreviews: readProductPreviews },
        );
      } catch (error) {
        pageError(error.message);
      } finally {
        if (trigger.isConnected) trigger.disabled = false;
      }
    });
  } else if (['weights', 'costs'].includes(selectedTab))
    renderOperations(panel, { record, draft, mode: selectedTab, onChange: schedule });
  else if (selectedTab === 'pricing') {
    await loadTemplates();
    if (!root.isConnected || renderVersions.get(root) !== version) return;
    renderPricing(panel, record);
  } else
    panel.innerHTML = `<section class="card hf-history"><h2>Histórico do pedido</h2><ol>${record.history.map((h) => `<li><strong>${esc(h.action)}</strong><span>${esc(new Date(h.at).toLocaleString('pt-BR'))}${h.responsible ? ' · ' + esc(h.responsible) : ''}</span></li>`).join('')}</ol></section>`;
  root.querySelector('[data-lifecycle]').onclick = async (event) => {
    const trigger = event.currentTarget;
    await auto.flush(key);
    if (!root.isConnected) return;
    if (autosaveErrors.has(key)) {
      pageError(autosaveErrors.get(key));
      return;
    }
    if (root.querySelector('.hf-lifecycle-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'hf-lifecycle-dialog';
    dialog.setAttribute('aria-labelledby', 'hf-lifecycle-title');
    const pending = store.get(key).computed.summary.incomplete;
    dialog.innerHTML = `<form><h2 id="hf-lifecycle-title">${locked ? 'Reabrir compra?' : 'Finalizar compra?'}</h2><p>${locked ? 'Os pesos, custos e produtos voltarão a aceitar ajustes. Os dados e o histórico serão mantidos.' : !draft.items.length ? 'Este pedido ainda não tem produtos. Você pode finalizar agora e reabrir quando quiser completar.' : pending ? `${pending} produto(s) ainda têm peso ou custo a completar. Você pode finalizar mesmo assim e reabrir depois.` : 'Os dados atuais serão mantidos. Você poderá reabrir a compra quando precisar ajustar alguma informação.'}</p>${!locked ? '<p>As alterações válidas do pedido serão salvas ao confirmar. A precificação continua independente.</p>' : ''}<label>Responsável (opcional)<input name="responsible" maxlength="100" value="${esc(draft.responsible)}"></label><p class="hf-error" role="alert"></p><div class="hf-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="submit">${locked ? 'Confirmar reabertura' : 'Confirmar finalização'}</button></div></form>`;
    root.append(dialog);
    const close = () => {
      dialog.close();
      dialog.remove();
      if (trigger.isConnected) trigger.focus();
    };
    dialog.querySelector('[data-cancel]').onclick = close;
    dialog.oncancel = (e) => {
      e.preventDefault();
      close();
    };
    dialog.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await auto.flush(key);
        await flushPricingSaves(key);
        const responsible = dialog.querySelector('[name=responsible]').value;
        if (locked) await store.reopen(key, { confirmed: true, responsible });
        else {
          await store.update(key, { ...draft, responsible }, catalog);
          await store.finalize(key, { confirmed: true, responsible });
        }
        clearDraft(key);
        close();
        refresh();
      } catch (error) {
        dialog.querySelector('.hf-error').textContent = error.message;
      }
    };
    dialog.showModal();
  };
  root.querySelector('[data-report]').onclick = async (event) => {
    const button = event.currentTarget;
    try {
      await auto.flush(key);
      await flushPricingSaves(key);
      if (autosaveErrors.has(key)) throw Error(autosaveErrors.get(key));
      const current = store.get(key);
      const report = current;
      button.disabled = true;
      pageError('');
      await previewOrder(root, report, button);
    } catch (e) {
      if (root.isConnected) pageError(e.message);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}

import { clearOnContextChange } from '../cadastros/remote.js';
clearOnContextChange('hortifruti_receipts', () => {
  auto.reset();
  autosaveErrors.clear();
  tabs.clear();
});
