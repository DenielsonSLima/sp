import { escapeHtml as esc } from '../../shared/ui.js';
import { formatBRLCents, attachCurrencyInput, currencyDecimal } from '../../shared/components/currency-input/index.js';
import { money, awardedByProvider, isProviderFinalized } from './state.js';
import { unitLabel } from '../cadastros/unidades/state.js';
import { MAX_OFFER_CENTS } from './offer-input.js';
import { supplierActionsMarkup } from './supplier-summary.js';

export const discountKey = (provider, item = '') => `${provider}|${item || ''}`;
const fields = (provider, item, spec, drafts, disabled, label) => {
  const draft = drafts.get(discountKey(provider, item)), type = draft?.type || spec?.type || 'amount',
    value = draft?.value ?? formatBRLCents(spec?.value ?? 0, MAX_OFFER_CENTS);
  return `<form class="quote-discount-form" data-provider="${esc(provider)}" data-item="${esc(item || '')}"><label class="visually-hidden">Tipo de desconto: ${esc(label)}</label><select name="type" aria-label="Tipo de desconto: ${esc(label)}" ${disabled ? 'disabled' : ''}><option value="amount" ${type === 'amount' ? 'selected' : ''}>R$</option><option value="percent" ${type === 'percent' ? 'selected' : ''}>%</option></select><input name="discount" inputmode="decimal" value="${esc(value)}" aria-label="Desconto: ${esc(label)}" ${disabled ? 'disabled' : ''}><span class="quote-discount-status" role="status" ${draft ? '' : 'hidden'}>${draft ? 'Será salvo ao sair do campo.' : ''}</span></form>`;
};
export function awardedGroupsMarkup(q, { itemPhoto, drafts, pending = false }) {
  return awardedByProvider(q).filter((p) => p.items.length).map((p) => {
    const disabled = q.status === 'finished' || isProviderFinalized(q, p.id);
    return `<section class="quote-award-group" data-award-provider="${esc(p.id)}"><header><div class="quote-award-heading"><h3>${esc(p.name)}</h3><span>${p.items.length} produto(s) ganho(s)</span></div>${supplierActionsMarkup({ ...p, finalized: disabled }, { pending, pdfLabel: 'Exportar' })}</header><div class="quote-award-table-wrap"><table class="quote-award-table"><thead><tr><th scope="col">Produto</th><th scope="col">Quantidade</th><th scope="col">Preço unitário</th><th scope="col">Desconto no produto</th><th scope="col">Total</th></tr></thead><tbody>${p.items.map((item) => `<tr data-award-item="${esc(item.id)}"><th scope="row"><div class="quote-product-identity">${itemPhoto(item)}<div><strong>${esc(item.name)}</strong><small>${esc(item.category || '')}</small></div></div></th><td>${item.quantity} ${esc(unitLabel(item.unit))}</td><td>${money(item.unitPrice)}</td><td>${fields(p.id, item.id, item.discount, drafts, disabled, item.name)}<small data-item-discount>${money(item.discountTotal || 0)} de desconto</small></td><td><strong data-item-net>${money(item.total)}</strong></td></tr>`).join('')}</tbody></table></div><div class="quote-award-discount-summary"><dl><div><dt>Total bruto</dt><dd data-group-gross>${money(p.grossTotal ?? p.total)}</dd></div><div><dt>Descontos nos produtos</dt><dd data-group-item-discounts>${money(p.itemDiscountTotal || 0)}</dd></div></dl><div class="quote-general-discount"><label>Desconto geral do fornecedor</label>${fields(p.id, null, p.discount, drafts, disabled, p.name)}<small>Aplicado ao subtotal após os descontos dos produtos.</small><strong data-group-discount>${money(p.discountTotal || 0)} de desconto geral</strong></div><div class="quote-award-net"><strong>Total líquido de ${esc(p.name)}</strong><strong data-group-net>${money(p.total)}</strong></div></div></section>`;
  }).join('') || '<p class="quote-explanation">Nenhum fornecedor escolhido ainda. Faça as escolhas na aba Produtos.</p>';
}

/** Only presents canonical amounts returned by PostgreSQL; never recalculates discounts. */
export function refreshAwardAmounts(root, q) {
  for (const provider of awardedByProvider(q)) {
    const group = root.querySelector(`[data-award-provider="${provider.id}"]`);
    if (!group) continue;
    const text = (selector, value) => { const node = group.querySelector(selector); if (node) node.textContent = value; };
    text('[data-group-gross]', money(provider.grossTotal ?? provider.total));
    text('[data-group-item-discounts]', money(provider.itemDiscountTotal || 0));
    text('[data-group-discount]', `${money(provider.discountTotal || 0)} de desconto geral`);
    text('[data-group-net]', money(provider.total));
    for (const item of provider.items) {
      text(`[data-award-item="${item.id}"] [data-item-net]`, money(item.total));
      text(`[data-award-item="${item.id}"] [data-item-discount]`, `${money(item.discountTotal || 0)} de desconto`);
    }
  }
  const total = root.querySelector('.quote-final-total strong');
  if (total) total.textContent = money(q.computed.selectedTotal);
}

export function attachDiscountForm(form, { saved, onDraft, save, onSaving, onSaved, onError }) {
  const input = form.elements.discount, type = form.elements.type;
  attachCurrencyInput(input, { maxCents: MAX_OFFER_CENTS });
  let persisted = `${saved.type}|${saved.value}`, queued, pending, saving = false;
  const capture = () => ({ type: type.value, value: input.value });
  const commit = () => {
    if (!input.checkValidity()) { onError(new Error(input.validationMessage)); return pending; }
    queued = capture();
    if (saving) return pending;
    saving = true;
    pending = (async () => {
      try {
        while (queued) {
          const current = queued; queued = null;
          const key = `${current.type}|${current.value}`;
          if (key === persisted) { onSaved(current); continue; }
          onSaving();
          try {
            await save(current.type, currencyDecimal(current.value, MAX_OFFER_CENTS));
            persisted = key;
            onSaved(current);
          } catch (error) { onError(error); }
        }
      } finally { saving = false; }
    })();
    return pending;
  };
  input.oninput = () => onDraft(capture());
  input.onblur = commit;
  type.onchange = () => { onDraft(capture()); return commit(); };
  form.onsubmit = (event) => { event.preventDefault(); return commit(); };
}
