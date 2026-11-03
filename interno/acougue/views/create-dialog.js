import { state } from '../state.js';
import { esc, receiptModelName } from '../common.js';
import { categories } from '../services.js';
import { loadReceiptModels } from '../queries.js';
import { watchReceiptModels } from '../realtime.js';
import { bindFormDialog } from '../../../shared/form-dialog.js';
import { attachCurrencyInput } from '../../../shared/components/currency-input/index.js';

const loading = new WeakSet();
export async function openReceiptDialog(root, { onContinue, title = 'Novo recebimento' } = {}) {
  if (loading.has(root) || root.querySelector('.butcher-create-dialog')) return;
  const currentView = root.firstElementChild;
  loading.add(root);
  try {
    await loadReceiptModels();
    if (!root.isConnected || root.firstElementChild !== currentView) return;
    state.draft.category ||= categories()[0] || '';
    const draft = { ...state.draft };
    const form = document.createElement('form');
    form.className = 'butcher-create-dialog';
    form.innerHTML = `<div class="butcher-fields">
      <label>Modelo de composição<select name="category" required>${categories().map((category) => `<option value="${esc(category)}" ${category === state.draft.category ? 'selected' : ''}>${esc(receiptModelName(category))}</option>`).join('')}</select></label>
      <label>Data do recebimento<input name="receivedDate" type="date" value="${esc(state.draft.receivedDate)}" required></label>
      <label>Quantidade de animais<input name="animalCount" type="number" min="1" max="1000" step="1" value="${esc(state.draft.animalCount)}" required></label>
      <label>Valor total da compra (R$)<input name="purchaseTotal" inputmode="decimal" value="${esc(state.draft.purchaseTotal)}" placeholder="0,00" required></label>
      <label class="butcher-header-wide">Identificação (opcional)<input name="reference" maxlength="80" value="${esc(state.draft.reference)}" placeholder="Ex.: Compra da manhã"></label>
      <label class="butcher-header-wide">Anotações<textarea name="notes" rows="4" maxlength="4000" placeholder="Informações sobre a compra (opcional)">${esc(state.draft.notes)}</textarea></label>
    </div><p class="butcher-help">Continue para informar os pesos e conferir a distribuição. O recebimento será gravado ao finalizar o registro.</p>
    <div class="butcher-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="submit">Continuar para pesagem →</button></div>`;
    const capture = () => {
      for (const field of ['category', 'receivedDate', 'animalCount', 'purchaseTotal', 'reference', 'notes']) {
        draft[field] = form.elements[field].value;
      }
    };
    const modal = bindFormDialog(form, {
      host: root, title, resource: 'butcher_receipts', onCancel: () => { modal.close(); modal.dispose(); },
    });
    form.querySelector('[data-cancel]').onclick = () => { modal.close(); modal.dispose(); };
    attachCurrencyInput(form.elements.purchaseTotal, { maxCents: 100000000 });
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      capture();
      for (const field of ['category', 'receivedDate', 'animalCount', 'purchaseTotal', 'reference', 'notes']) {
        state.draft[field] = draft[field];
      }
      modal.close();
      modal.dispose();
      onContinue?.();
    };
    modal.open();
    const stopModels = watchReceiptModels(form, () => {
      for (const option of form.elements.category.options) {
        const label = receiptModelName(option.value);
        if (option.textContent !== label) option.textContent = label;
      }
    });
    modal.dialog.addEventListener('close', stopModels, { once: true });
  } catch (error) {
    if (root.isConnected && root.firstElementChild === currentView) {
      const status = root.querySelector('.butcher-status');
      if (status) status.textContent = error.message;
    }
  } finally {
    loading.delete(root);
  }
}
