import { butcherCatalogService } from '../services.js';
import { getDataContext } from '../../../../shared/data/api.js';
import { esc } from '../presentation.js';
import { attachWeightInput, weightDecimal } from '../../../../shared/components/weight-input.js';

const decimalDisplay = (raw) => Number(String(raw).replace(',', '.')).toLocaleString('pt-BR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export const weightDisplay = (raw) => raw === '' || raw == null ? '' : decimalDisplay(raw);
const gramsDisplay = (grams) => decimalDisplay(grams / 1000);
const percentDisplay = (raw) => raw === '' || raw == null ? '—' : `${decimalDisplay(raw)}%`;
export { attachWeightInput, weightDecimal };

export const weighingMarkup = () => `<div class="module-tabs butcher-composition-tabs" role="tablist" aria-label="Composição e custos do modelo">
  <button type="button" role="tab" id="composition-percent-tab" data-composition-mode="percent" aria-controls="composition-panel">Por percentual</button>
  <button type="button" role="tab" id="composition-weight-tab" data-composition-mode="weight" aria-controls="composition-panel">Por pesagem</button>
  <button type="button" role="tab" id="composition-costs-tab" data-composition-mode="costs" aria-controls="model-costs-panel">Custos</button></div>
  <div class="butcher-weighing-base" hidden><label>Peso total de 1 animal para desossa (KG)
  <input class="weighing-total" inputmode="decimal" placeholder="0,00"></label>
  <p class="butcher-help">Informe o peso recebido para desossa e distribua entre os cortes. Os percentuais são calculados automaticamente. Produtos em UND continuam por quantidade.</p>
  <p class="weighing-summary" role="status" aria-live="polite"></p></div>`;

export const weightInput = (part, index) => `<label>Peso do corte (KG)<input data-field="weight" inputmode="decimal"
  placeholder="0,00" value="${esc(weightDisplay(part.weight))}">
  <small class="weighing-percent" data-percent-index="${index}">${percentDisplay(part.percent)}</small></label>`;

export function bindModelWeighing(form, { editor, onChange, renderParts, isBusy }) {
  const scope = getDataContext(), total = form.querySelector('.weighing-total');
  const summary = form.querySelector('.weighing-summary');
  attachWeightInput(total);
  let generation = 0, timer, result = editor.draft.weighing, error = '';
  let selectedPanel = editor.draft.compositionMode;
  const current = () => form.isConnected && scope?.companyId === getDataContext()?.companyId
    && scope?.user?.id === getDataContext()?.user?.id;
  const refresh = () => {
    const weightMode = editor.draft.compositionMode === 'weight';
    const costs = selectedPanel === 'costs';
    form.querySelector('.butcher-weighing-base').hidden = costs || !weightMode;
    form.querySelector('.butcher-composition-content').hidden = costs;
    form.querySelector('.butcher-costs-panel').hidden = !costs;
    total.value = weightDisplay(editor.draft.weighingTotal);
    form.querySelectorAll('[data-composition-mode]').forEach((button) => {
      const selected = button.dataset.compositionMode === selectedPanel;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.disabled = isBusy();
    });
    form.querySelector('.butcher-editor-parts').setAttribute('aria-labelledby', `composition-${weightMode ? 'weight' : 'percent'}-tab`);
    summary.textContent = error || (result?.totalGrams != null
      ? `Distribuído: ${gramsDisplay(result.distributedGrams)} KG · Restante: ${gramsDisplay(result.remainingGrams)} KG · Rendimento: ${percentDisplay(result.totalBps / 100)}`
      : 'Informe o peso total e os pesos dos cortes para calcular o rendimento.');
    form.querySelectorAll('[data-percent-index]').forEach((label) => {
      const value = editor.draft.parts[Number(label.dataset.percentIndex)]?.percent;
      label.textContent = percentDisplay(value);
    });
  };
  const calculate = async () => {
    clearTimeout(timer);
    const request = ++generation;
    if (!current()) return false;
    if (editor.draft.compositionMode !== 'weight') return true;
    const input = { totalWeight: editor.draft.weighingTotal, parts: structuredClone(editor.draft.parts) };
    try {
      const response = await butcherCatalogService.weighModel(input);
      if (request !== generation || !current()) return false;
      result = response; error = '';
      editor.change({ parts: editor.draft.parts.map((part) => {
        const row = response.rows.find((item) => item.productId === part.productId);
        return row ? { ...part, percent: row.percent.replace('.', ',') } : part;
      }) });
      refresh();
      return true;
    } catch (failure) {
      if (request !== generation || !current()) return false;
      result = null; error = failure.message; refresh();
      throw failure;
    }
  };
  const schedule = () => {
    clearTimeout(timer); generation++; result = null;
    if (editor.draft.compositionMode !== 'weight') return;
    error = 'Calculando rendimento…'; refresh();
    timer = setTimeout(() => { if (current()) void calculate().catch(() => {}); }, 300);
  };
  total.oninput = () => {
    editor.change({ weighingTotal: weightDecimal(total.value) }); onChange(); schedule();
  };
  const selectMode = async (mode) => {
    if (isBusy() || !current() || mode === selectedPanel) return;
    if (mode === 'costs') {
      selectedPanel = mode; refresh(); return;
    }
    if (mode === editor.draft.compositionMode) {
      selectedPanel = mode; refresh(); return;
    }
    if (editor.draft.compositionMode === 'weight') {
      try { await calculate(); } catch { return; }
      if (!current() || isBusy()) return;
    }
    selectedPanel = mode;
    editor.change({ compositionMode: mode }); onChange(); renderParts(); refresh();
    if (mode === 'weight' && editor.draft.weighingTotal) schedule();
  };
  form.querySelectorAll('[data-composition-mode]').forEach((button) => {
    button.onclick = () => void selectMode(button.dataset.compositionMode);
    button.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const modes = ['percent', 'weight', 'costs'];
      const offset = event.key === 'ArrowLeft' ? -1 : 1;
      const mode = event.key === 'Home' ? modes[0] : event.key === 'End' ? modes.at(-1)
        : modes[(modes.indexOf(selectedPanel) + offset + modes.length) % modes.length];
      void selectMode(mode).then(() => form.querySelector(`[data-composition-mode="${selectedPanel}"]`)?.focus());
    };
  });
  refresh();
  return {
    refresh,
    schedule,
    flush: calculate,
    reset() {
      clearTimeout(timer); generation++; result = editor.draft.weighing; error = '';
      if (selectedPanel !== 'costs') selectedPanel = editor.draft.compositionMode;
      refresh();
    },
  };
}
