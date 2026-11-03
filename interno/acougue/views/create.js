import { state, blankDraft } from '../state.js';
import { esc, kg, percent, dateText, chrome, receiptMarkup, money, receiptModelName } from '../common.js';
import { currentModel, estimateReceipt, saveReceipt } from '../services.js';
import { renderList } from './list.js';
import { loadReceiptModels } from '../queries.js';
import { useLatestPreview } from '../../hooks/use-latest-preview.js';
import { openReceiptDialog } from './create-dialog.js';
import { weightEntryMarkup, bindWeightEntry } from './weight-entry.js';

export async function renderCreate(root) {
  const previousView = root.firstElementChild;
  try {
    await loadReceiptModels();
  } catch (error) {
    if (root.isConnected && root.firstElementChild === previousView) {
      const status = root.querySelector('.butcher-status');
      if (status) status.textContent = error.message;
    }
    return;
  }
  if (!root.isConnected || root.firstElementChild !== previousView) return;
  const model = currentModel(state.draft.category);
  const allowParts = model?.species === 'bovine';
  if (!allowParts && state.draft.weightMode === 'parts') state.draft.weightMode = 'total';
  root.innerHTML = `${chrome()}
    <nav class="butcher-breadcrumb" aria-label="Caminho de navegação"><button class="butcher-back-link back-receipts" type="button">Açougue</button><span aria-hidden="true">/</span><span>Novo recebimento</span></nav>
    <div class="butcher-toolbar"><div><h2 tabindex="-1">Novo recebimento</h2><p>Informe os pesos recebidos e confira a distribuição do modelo cadastrado.</p></div><button class="button secondary back-receipts" type="button">← Voltar para lista</button></div>
    <section class="card butcher-purchase-header"><div class="butcher-purchase-data"></div><button class="button secondary edit-receipt-header" type="button">Editar dados da compra</button></section>
    <form class="card butcher-receipt-form">${weightEntryMarkup({ allowParts })}
      <p class="butcher-lot-summary" aria-live="polite"></p><div class="butcher-current-model"></div><div class="butcher-unit-quantities"></div>
      <p class="butcher-help">Informe o peso dos animais inteiros recebidos para desossa. Os cortes são estimados uma vez sobre esse total, usando os rendimentos do cadastro. Informar dianteiros e traseiros identifica a entrada dos animais completos; não cria uma ficha para compras de quartos avulsos. Quantidades em UND seguem o padrão por animal e podem ser substituídas pela contagem real.</p>
      <button class="button primary calculate-receipt" type="submit">Calcular distribuição</button>
    </form><p class="butcher-status" role="status" aria-live="polite"></p>
    <section class="butcher-receipt-result" hidden><div class="butcher-toolbar"><h2>Distribuição estimada</h2><button class="button primary save-receipt" type="button">Registrar recebimento</button></div><div class="butcher-receipt-detail"></div></section>`;
  const form = root.querySelector('form');
  const status = root.querySelector('.butcher-status');
  const result = root.querySelector('.butcher-receipt-result');
  const save = root.querySelector('.save-receipt');
  let pending = null, saving = false, estimateVersion = 0;
  const header = () => {
    root.querySelector('.butcher-purchase-data').innerHTML = `<div><span>Modelo de composição</span><strong>${esc(receiptModelName(state.draft.category))}</strong></div>
      <div><span>Data</span><strong>${dateText(state.draft.receivedDate)}</strong></div><div><span>Quantidade</span><strong>${esc(state.draft.animalCount)} animal(is)</strong></div>
      <div><span>Valor total da compra</span><strong>R$ ${esc(state.draft.purchaseTotal)}</strong></div>
      ${state.draft.reference ? `<div class="butcher-header-wide"><span>Identificação</span><strong>${esc(state.draft.reference)}</strong></div>` : ''}
      ${state.draft.notes ? `<div class="butcher-header-wide"><span>Anotações</span><p>${esc(state.draft.notes)}</p></div>` : ''}`;
  };
  const capture = () => {
    weighing.capture();
    state.draft.quantities = Object.fromEntries(
      [...form.querySelectorAll('[data-quantity]')].map((input) => [input.dataset.quantity, input.value]),
    );
  };
  const invalidate = () => {
    estimateVersion++;
    pending = null;
    result.hidden = true;
    save.disabled = true;
    status.textContent = '';
  };
  const preview = useLatestPreview({
    run: estimateReceipt,
    isCurrent: () => form.isConnected,
    onResult: (lot) => {
      root.querySelector('.butcher-lot-summary').textContent = `${lot.animalCount} animal(is) · total ${kg(lot.weightGrams)} kg · compra ${money(lot.purchaseTotalCents)}. A distribuição será aplicada uma vez sobre esse total.`;
    },
    onError: (error) => { root.querySelector('.butcher-lot-summary').textContent = error.message; },
  });
  const changed = () => { capture(); header(); invalidate(); preview.schedule(state.draft); };
  const weighing = bindWeightEntry(form, { onChange: changed });
  root.querySelector('.butcher-current-model').innerHTML = model
    ? `<p class="butcher-model-context"><strong>${esc(model.name)} · versão ${model.version}</strong><span>${model.parts.filter((part) => part.active).length} corte(s) ativo(s) · ${percent(model.totalBps)}% configurados</span></p>`
    : '<p class="butcher-unallocated">Esta espécie animal não tem modelo atual ativo. <a href="#cadastros/acougue">Defina um em Cadastros → Açougue.</a></p>';
  root.querySelector('.calculate-receipt').disabled = !model;
  root.querySelector('.butcher-unit-quantities').innerHTML = model ? model.parts
    .filter((part) => part.active && part.unit === 'UN')
    .map((part) => `<label>${esc(part.name)} — contagem real em UND (opcional)<input data-quantity="${part.id}" inputmode="numeric" value="${esc(state.draft.quantities[part.id] ?? '')}" placeholder="${part.quantityPerAnimal ? esc(part.quantityPerAnimal) + ' UND por animal no padrão' : 'Quantidade contada'}"></label>`).join('') : '';
  form.oninput = (event) => {
    if (event.target.matches('[name=weight],[data-animal-weight],[data-section-weight],[data-section-quantity],[data-section-side],[data-quantity]')) changed();
    else { capture(); invalidate(); }
  };
  form.onchange = (event) => {
    if (event.target.matches('[data-section-side],[data-section-quantity]')) changed();
  };
  root.querySelector('.edit-receipt-header').onclick = () => {
    capture();
    openReceiptDialog(root, { title: 'Dados da compra', onContinue: () => renderCreate(root) });
  };
  root.querySelectorAll('.back-receipts').forEach((button) => {
    button.onclick = () => {
      capture();
      renderList(root);
      root.querySelector('.add-receipt').focus();
    };
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const version = ++estimateVersion;
    const calculate = root.querySelector('.calculate-receipt');
    calculate.disabled = true;
    try {
      capture();
      const snapshot = structuredClone(state.draft);
      const receipt = await estimateReceipt(snapshot);
      if (!form.isConnected || version !== estimateVersion) return;
      pending = { ...snapshot, expectedModelId: receipt.modelId, ...(receipt.modelRecordVersion ? { expectedModelVersion: receipt.modelRecordVersion } : {}) };
      root.querySelector('.butcher-receipt-detail').innerHTML = receiptMarkup(receipt);
      result.hidden = false;
      save.disabled = false;
      status.textContent = 'Confira os pesos e o rateio da compra antes de registrar.';
    } catch (error) {
      if (!form.isConnected || version !== estimateVersion) return;
      pending = null;
      result.hidden = true;
      status.textContent = error.message;
    } finally {
      if (calculate.isConnected) calculate.disabled = !currentModel(state.draft.category);
    }
  };
  save.onclick = async () => {
    if (!pending || saving) return;
    try {
      if (currentModel(pending.category)?.id !== pending.expectedModelId || (pending.expectedModelVersion && currentModel(pending.category)?._version !== pending.expectedModelVersion)) {
        throw Error('O modelo atual mudou. Calcule novamente para revisar a distribuição.');
      }
      save.disabled = true;
      saving = true;
      form.inert = true;
      root.querySelector('.butcher-purchase-header').inert = true;
      await saveReceipt(pending);
      if (!form.isConnected) return;
      pending = null;
      state.draft = { ...blankDraft(), category: state.draft.category };
      state.listMessage = 'Recebimento registrado com os pesos, o valor da compra e o modelo utilizado.';
      renderList(root);
      root.querySelector('.add-receipt').focus();
    } catch (error) {
      saving = false;
      form.inert = false;
      if (!form.isConnected) return;
      root.querySelector('.butcher-purchase-header').inert = false;
      status.textContent = error.message;
      save.disabled = false;
    }
  };
  header();
  root.querySelector('.butcher-toolbar h2').focus();
}
