import { escapeHtml } from '../../../shared/ui.js';
import { formatOfferPrice } from '../price-format.js';

export function offerTextInput(element) {
  const value = escapeHtml(element.text);
  if (element.offerField === 'price') {
    const price = element.text === 'R$ —,—' ? '' : element.text.replace(/^R\$\s*/i, '');
    return `<label>Preço na arte (R$)<input name="text" inputmode="decimal" maxlength="40" placeholder="0,00" value="${escapeHtml(price)}"></label><p class="flyer-help">Digite somente os números: 458 vira 4,58.</p>`;
  }
  if (element.offerField === 'name')
    return `<label>Descrição na arte<textarea name="text" rows="3" maxlength="180">${value}</textarea></label>`;
  if (element.offerField === 'unit')
    return `<label>Unidade na arte<input name="text" maxlength="40" value="${value}"></label>`;
  return `<label>Texto<textarea name="text" rows="3" maxlength="4000">${value}</textarea></label>`;
}

export function readOfferText(element, value) {
  const raw = String(value ?? '');
  if (element.offerField !== 'price') return raw;
  const price = formatOfferPrice(raw);
  return price ? `R$ ${price}` : 'R$ —,—';
}
