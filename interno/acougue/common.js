import { heading, escapeHtml as esc } from '../../shared/ui.js';
import { kg, percent, currentModel, listModels } from './services.js';
export { esc, kg, percent };
export function receiptModelName(category) {
  const current = currentModel(category);
  if (current) return current.name;
  const drafts = listModels().filter((model) => model.category === category && model.active);
  return drafts.length === 1 ? drafts[0].name : category;
}
export const stamp = (value) => new Date(value).toLocaleString('pt-BR');
export const dateText = (value) => value.split('-').reverse().join('/');
export const money = (cents) => cents == null ? 'Não informado' : (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const chrome = (actions = '') => {
  const title = heading('OPERAÇÃO', 'Açougue');
  return `${actions ? `<div class="page-heading-actions">${title}${actions}</div>` : title}`;
};
const modeLabel = (mode) => ({ individual: 'Peso por animal', parts: 'Dianteiros e traseiros', total: 'Peso total do lote' })[mode] || 'Peso total do lote';
function purchaseMarkup(receipt) {
  if (receipt.purchaseTotalCents == null && !receipt.notes) return '';
  return `<section class="card butcher-purchase-snapshot"><h3>Dados da compra</h3><div class="butcher-purchase-data">
    ${receipt.purchaseTotalCents != null ? `<div><span>Valor total da compra</span><strong>${money(receipt.purchaseTotalCents)}</strong></div><div><span>Custo médio por kg recebido</span><strong>${money(receipt.purchaseCostPerKgCents)}/kg</strong></div>` : ''}
    ${receipt.notes ? `<div class="butcher-header-wide"><span>Anotações</span><p>${esc(receipt.notes)}</p></div>` : ''}
  </div></section>`;
}
function sectionsMarkup(receipt) {
  if (receipt.weightMode !== 'parts') return '';
  return `<section class="card butcher-section-snapshot"><h3>Partes recebidas e rateio da compra</h3>
    <p class="butcher-help">O valor da compra é distribuído proporcionalmente ao peso de cada linha.</p>
    <div class="butcher-section-table-wrap"><table class="butcher-section-table"><thead><tr><th>Parte</th><th>Lado</th><th>Quantidade</th><th>Peso da linha</th><th>Custo atribuído</th></tr></thead><tbody>
    ${(receipt.sections || []).map((section) => `<tr><td>${section.type === 'forequarter' ? 'Dianteiro' : 'Traseiro'}</td><td>${section.side === 'left' ? 'Esquerdo' : 'Direito'}</td><td>${section.quantity}</td><td>${kg(section.weightGrams)} kg</td><td>${money(section.allocatedCostCents)}</td></tr>`).join('')}
    </tbody></table></div></section>`;
}
export function receiptMarkup(receipt) {
  return `<p class="butcher-help">${esc(receipt.category)} · ${receipt.animalCount ?? 1} animal(is) · ${modeLabel(receipt.weightMode)} · ${esc(receipt.modelName)} · versão ${receipt.modelVersion}</p>
    ${purchaseMarkup(receipt)}
    <div class="butcher-result-summary"><div><span>Peso total do lote</span><strong>${kg(receipt.weightGrams)} kg</strong></div><div><span>Distribuição estimada</span><strong>${percent(receipt.totalBps)}%</strong></div><div><span>Não distribuído</span><strong>${kg(receipt.unallocatedGrams)} kg</strong></div></div>
    ${sectionsMarkup(receipt)}
    ${receipt.weightMode === 'individual' ? `<details class="card butcher-animal-snapshot"><summary>Pesos dos ${receipt.animalCount} animais</summary><ul>${receipt.animals.map((animal, index) => `<li><span>${esc(animal.identification || `Animal ${index + 1}`)}</span><strong>${kg(animal.weightGrams)} kg</strong></li>`).join('')}</ul></details>` : ''}
    <div class="butcher-estimated-grid">${receipt.rows.map((row) => `<article class="card butcher-estimated-part"><span>${row.unit === 'KG' ? 'Controle em kg' : 'Controle em unidade'}</span><h3>${esc(row.name)}</h3>
      ${row.estimatedGrams === null ? `<strong>${row.quantity} <small>UND</small></strong><p>${row.quantityPerAnimal} UND por animal · ${row.quantitySource === 'manual' ? 'Contagem informada' : 'Quantidade prevista pelo modelo'}</p>` : `<strong>${kg(row.estimatedGrams)} <small>kg</small></strong><p>Peso estimado · ${percent(row.percentBps)}% do recebido</p>${row.unit === 'UN' ? `<p class="butcher-unit-note">${row.quantity === null ? 'Quantidade de unidades não informada.' : `${row.quantity} unidade(s) informada(s) manualmente.`}</p>` : ''}`}
    </article>`).join('')}</div>
    ${receipt.unallocatedGrams ? `<p class="butcher-unallocated">${kg(receipt.unallocatedGrams)} kg permanecem sem distribuição. Esse saldo não representa automaticamente perda ou descarte.</p>` : ''}`;
}
