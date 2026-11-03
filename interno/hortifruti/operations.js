import { calculate } from '../../shared/data/api.js';
import { attachWeightInput, weightDecimal, weightInputDisplay, formatWeightMicros } from './weight-input.js';
import { attachCurrencyInput, currencyDecimal, formatBRLCents } from '../../shared/components/currency-input/index.js';
import { formatDecimal, money } from './model.js';
import { isPhotoData } from '../cadastros/produtos/photo.js';
import { esc } from './common.js';
import { weighingSummary, setWeighingExpanded } from './weighing-summary.js';
let weighingSequence = 0;
const costDisplay = (value) => {
  if (!String(value ?? '').trim()) return '';
  const cents = Math.round(Number(String(value).replace(',', '.')) * 100);
  try {
    return formatBRLCents(cents);
  } catch {
    return String(value);
  }
};
export function renderOperations(root, { record, draft, mode, onChange }) {
  const finished = record.status === 'finished';
  root.innerHTML = `<div class="hf-toolbar"><div><h2>${mode === 'weights' ? 'Pesagem líquida' : 'Custos da compra'}</h2><p>${mode === 'weights' ? 'Informe o peso líquido total ou por caixa, na ordem que preferir.' : 'Informe custo por kg ou total pago, antes ou depois da pesagem.'}</p></div><span class="hf-auto-hint">Salvamento automático</span></div><p class="hf-help">${mode === 'weights' ? 'O peso já é líquido. Não há desconto de tara. Uma caixa adicionada depois recalcula o custo por kg e preserva o total pago.' : 'Campos vazios ficam pendentes. Preços de venda são independentes e ficam na aba Precificação.'}</p><div class="hf-operation-list"></div><p class="hf-error" role="alert"></p>`;
  const list = root.querySelector('.hf-operation-list');
  if (!draft.items.length)
    list.innerHTML =
      '<section class="card hf-empty"><h3>Selecione os produtos primeiro</h3><p>Use a aba Produtos e o botão Adicionar produtos.</p></section>';
  draft.items.forEach((item, itemIndex) => {
    const snapshot = record.items.find((i) => i.productId === item.productId);
    if (!snapshot) return;
    const row = document.createElement('section');
    row.className = `card hf-operation ${mode === 'weights' ? 'hf-weighing-row' : 'hf-cost-row'}`;
    const photo =
      snapshot.photo && isPhotoData(snapshot.photo)
        ? `<img class="hf-item-photo" src="${esc(snapshot.photo)}" alt="">`
        : '<span class="hf-photo-placeholder">Sem foto</span>';
    row.innerHTML = `<div class="hf-product-title"><span class="hf-item-number">${itemIndex + 1}</span>${photo}<div><h3>${esc(snapshot.name)}</h3><p>Cód. ${esc(snapshot.code || '—')} · ${esc(snapshot.purchaseUnit || '—')}</p></div></div>${mode === 'costs' ? `<div class="hf-cost-metrics" aria-live="polite"><div><span data-count-label>CAIXAS</span><strong data-cost-count>—</strong></div><div class="hf-cost-weight"><span data-weight-label>PESO TOTAL</span><strong><span data-cost-weight>—</span> <small>kg</small></strong></div></div>` : ''}<fieldset ${finished ? 'disabled' : ''}><legend class="visually-hidden">${esc(snapshot.name)}</legend>${mode === 'weights' ? `<div class="hf-fields"><label>Modo de pesagem<select data-mode><option value="total" ${item.weighMode !== 'boxes' ? 'selected' : ''}>Peso líquido total</option><option value="boxes" ${item.weighMode === 'boxes' ? 'selected' : ''}>Peso líquido por caixa</option></select></label><label>Peso líquido (kg)<input data-weight inputmode="decimal" placeholder="A pesar" value="${esc(weightInputDisplay(item.quantity))}"></label>${String(snapshot.purchaseUnit).toUpperCase() === 'UN' ? `<label>Quantidade de unidades (opcional)<input data-unit-count inputmode="numeric" value="${esc(item.unitCount || '')}" placeholder="Não informado"></label>` : ''}</div><div class="hf-box-area"><label class="hf-previous">Peso anterior acumulado (kg)<input data-previous inputmode="decimal" value="${esc(weightInputDisplay(item.previousWeight))}"></label><div class="hf-box-list"></div>${!finished ? '<button class="button secondary" data-add-box type="button">+ Adicionar caixa</button>' : ''}</div>` : `<div class="hf-fields"><label>Valor unitário / kg (R$)<input data-unit-cost value="${esc(costDisplay(item.unitCost))}" placeholder="0,00"></label><label>Valor total (R$)<input data-total-cost value="${esc(costDisplay(item.total))}" placeholder="0,00"></label></div><p class="hf-help">Ao informar o total, o custo por kg é calculado com até seis casas decimais, sem alterar o total pago.</p>`}</fieldset><div class="hf-calculated" aria-live="polite"></div><p class="hf-line-error" role="alert"></p>`;
    list.append(row);
    let initializing = true;
    let summaryToggle = null,
      summaryPanel = null;
    if (mode === 'weights') {
      const id = `hf-weight-panel-${++weighingSequence}`;
      row.querySelector('.hf-product-title').remove();
      summaryPanel = document.createElement('div');
      summaryPanel.className = 'hf-weighing-details';
      summaryPanel.id = id;
      while (row.firstChild) summaryPanel.append(row.firstChild);
      summaryToggle = document.createElement('button');
      summaryToggle.type = 'button';
      summaryToggle.className = 'hf-weighing-toggle';
      summaryToggle.setAttribute('aria-expanded', 'false');
      summaryToggle.setAttribute('aria-controls', id);
      summaryToggle.innerHTML = `<span class="hf-item-number">${itemIndex + 1}</span>${photo}<span class="hf-weighing-name"><strong>${esc(snapshot.name)}</strong><small>Cód. ${esc(snapshot.code || '—')}</small></span><span class="hf-weighing-count"></span><span class="hf-weighing-weight"></span><span class="hf-weighing-chevron" aria-hidden="true">⌄</span>`;
      row.append(summaryToggle, summaryPanel);
      setWeighingExpanded(summaryToggle, summaryPanel, false);
      summaryToggle.onclick = () =>
        setWeighingExpanded(summaryToggle, summaryPanel, summaryToggle.getAttribute('aria-expanded') !== 'true');
    }
    const refreshSummary = () => {
      const value = weighingSummary(item, snapshot.purchaseUnit);
      const metrics = row.querySelector('.hf-cost-metrics');
      if (metrics) {
        metrics.querySelector('[data-weight-label]').textContent =
          value.incomplete && !value.invalid ? 'PESO PARCIAL' : 'PESO TOTAL';
        metrics.querySelector('[data-count-label]').textContent =
          String(snapshot.purchaseUnit).toUpperCase() === 'UN' && item.weighMode !== 'boxes' ? 'UNIDADES' : 'CAIXAS';
        metrics.querySelector('[data-cost-count]').textContent = value.countLabel.match(/^\d+/)?.[0] || '—';
        metrics.querySelector('[data-cost-weight]').textContent = value.invalid
          ? 'Verificar'
          : value.weightMicros
            ? formatWeightMicros(value.weightMicros)
            : '—';
        metrics.querySelector('.hf-cost-weight small').hidden = value.invalid;
        metrics.classList.toggle('has-error', value.invalid);
      }
      if (!summaryToggle) return;
      summaryToggle.querySelector('.hf-weighing-count').textContent = value.countLabel;
      summaryToggle.querySelector('.hf-weighing-weight').textContent =
        value.weightLabel + (value.incomplete && !value.invalid ? ' · parcial' : '');
      summaryToggle.classList.toggle('has-error', value.invalid);
    };
    let calculationVersion = 0;
    const recalc = async () => {
      const version = ++calculationVersion,
        notify = !initializing;
      if (notify) {
        // Queue raw input now, so leaving the tab cannot discard edits while the preview RPC is pending.
        onChange?.();
        await new Promise((resolve) => setTimeout(resolve, 180));
        if (version !== calculationVersion || !row.isConnected) return;
      }
      if (mode === 'weights') {
        row.querySelector('[data-weight]').readOnly = item.weighMode === 'boxes';
        row.querySelector('.hf-box-area').hidden = item.weighMode !== 'boxes';
        if (item.previousWeight) row.dataset.previousShown = 'true';
        row.querySelector('.hf-previous').hidden = !row.dataset.previousShown;
      }
      try {
        const value = await calculate('hortifruti_line', item);
        if (version !== calculationVersion || !row.isConnected) return;
        item._computed = value;
        if (item.weighMode === 'boxes') item.quantity = formatDecimal(value.quantityMicros);
        if (item.basis === 'total') item.unitCost = formatDecimal(value.unitMicros);
        else item.total = formatDecimal(value.totalCents, 2);
        if (mode === 'weights') {
          row.querySelector('[data-weight]').readOnly = item.weighMode === 'boxes';
          if (item.weighMode === 'boxes') row.querySelector('[data-weight]').value = weightInputDisplay(item.quantity);
          row.querySelector('.hf-box-area').hidden = item.weighMode !== 'boxes';
          if (item.previousWeight) row.dataset.previousShown = 'true';
          row.querySelector('.hf-previous').hidden = !row.dataset.previousShown;
        } else {
          if (item.basis === 'total' && document.activeElement !== row.querySelector('[data-unit-cost]'))
            row.querySelector('[data-unit-cost]').value = costDisplay(item.unitCost);
          if (item.basis === 'unit' && document.activeElement !== row.querySelector('[data-total-cost]'))
            row.querySelector('[data-total-cost]').value = costDisplay(item.total);
        }
        row.querySelector('.hf-calculated').textContent =
          `Peso líquido: ${value.quantityMicros ? formatWeightMicros(value.quantityMicros) + ' kg' : 'a pesar'} · Custo/kg: ${value.unitMicros ? formatDecimal(value.unitMicros) + ' reais' : 'a informar'} · Total: ${money(value.totalCents)}`;
        row.querySelector('.hf-line-error').textContent = '';
      } catch (e) {
        if (version !== calculationVersion || !row.isConnected) return;
        item._computed = { invalid: true, quantityMicros: null, boxesIncomplete: true };
        row.querySelector('.hf-line-error').textContent = e.message;
        row.querySelector('.hf-calculated').textContent = 'Confira os campos indicados para atualizar o cálculo.';
      }
      refreshSummary();
    };
    if (mode === 'weights') {
      row.querySelector('[data-unit-count]')?.addEventListener('input', (event) => {
        item.unitCount = event.target.value;
        recalc();
      });
      const drawBoxes = () => {
        row.querySelector('.hf-box-list').innerHTML = (item.boxes || [])
          .map(
            (weight, index) =>
              `<div class="hf-box"><label>Caixa ${index + 1} · peso líquido (kg)<input data-box="${index}" inputmode="decimal" value="${esc(weightInputDisplay(weight))}" placeholder="A pesar"></label>${!finished ? `<button class="button secondary" type="button" data-remove-box="${index}">Remover caixa ${index + 1}</button>` : ''}</div>`,
          )
          .join('');
        row.querySelectorAll('[data-box]').forEach((el) => {
          attachWeightInput(el);
          el.oninput = () => {
            try {
              item.boxes[Number(el.dataset.box)] = weightDecimal(el.value);
              recalc();
            } catch (error) {
              item.boxes[Number(el.dataset.box)] = el.value;
              row.querySelector('.hf-line-error').textContent = error.message;
              onChange?.();
            }
          };
        });
        row.querySelectorAll('[data-remove-box]').forEach(
          (el) =>
            (el.onclick = () => {
              if (!el.dataset.confirm) {
                el.dataset.confirm = 'yes';
                el.textContent = 'Confirmar remoção';
                return;
              }
              item.boxes.splice(Number(el.dataset.removeBox), 1);
              drawBoxes();
              recalc();
            }),
        );
      };
      drawBoxes();
      row.querySelector('[data-add-box]')?.addEventListener('click', () => {
        item.boxes ??= [];
        item.boxes.push('');
        drawBoxes();
        recalc();
        [...row.querySelectorAll('[data-box]')].at(-1)?.focus();
      });
      row.querySelector('[data-mode]').onchange = (event) => {
        if (
          event.target.value === 'boxes' &&
          item.weighMode !== 'boxes' &&
          !item.boxes?.length &&
          !item.previousWeight &&
          item.quantity
        ) {
          item.previousWeight = item.quantity;
          row.querySelector('[data-previous]').value = weightInputDisplay(item.previousWeight);
        }
        item.weighMode = event.target.value;
        recalc();
      };
      for (const [selector, key] of [
        ['[data-weight]', 'quantity'],
        ['[data-previous]', 'previousWeight'],
      ]) {
        const input = row.querySelector(selector);
        attachWeightInput(input);
        input.oninput = () => {
          try {
            item[key] = weightDecimal(input.value);
            recalc();
          } catch (error) {
            item[key] = input.value;
            row.querySelector('.hf-line-error').textContent = error.message;
            onChange?.();
          }
        };
      }
    } else {
      for (const [selector, key, basis] of [
        ['[data-unit-cost]', 'unitCost', 'unit'],
        ['[data-total-cost]', 'total', 'total'],
      ]) {
        const input = row.querySelector(selector);
        attachCurrencyInput(input);
        input.addEventListener('input', () => {
          item.basis = basis;
          try {
            item[key] = currencyDecimal(input.value);
            recalc();
          } catch (e) {
            item[key] = input.value;
            row.querySelector('.hf-line-error').textContent = e.message;
            row.querySelector('.hf-calculated').textContent = 'Confira os campos indicados para atualizar o cálculo.';
            onChange?.();
          }
        });
      }
    }
    recalc();
    initializing = false;
  });
}
