import { escapeHtml } from '../../../shared/ui.js';
import { normalizePriceBadge } from '../price-badge.js';
import { offerTextInput } from './offer-fields.js';

export function priceBadgeControls(element, fontOptions) {
  const badge = normalizePriceBadge(element.priceBadge);
  return `${offerTextInput(element)}
    <p class="flyer-help">O R$ fica menor, o valor em destaque e os centavos menores. Tudo se ajusta ao redimensionar o selo.</p>
    <label>Unidade no selo<input name="badgeUnit" maxlength="40" value="${escapeHtml(badge.unit)}" placeholder="cada, por kg…"></label>
    <label>Fonte<select name="fontFamily">${fontOptions(element.fontFamily)}</select></label>
    <label>Peso do valor<select name="fontWeight">${[400, 600, 700, 900].map(n => `<option value="${n}" ${Number(element.fontWeight) === n ? 'selected' : ''}>${n === 900 ? 'Extra' : n === 700 ? 'Negrito' : n === 600 ? 'Seminegrito' : 'Normal'}</option>`).join('')}</select></label>
    <div class="flyer-two-fields"><label>Cor do preço<input type="color" name="color" value="${element.color}"></label><label>Cor do círculo<input type="color" name="badgeFill" value="${badge.fill}"></label></div>
    <label class="flyer-check"><input type="checkbox" name="badgeTransparent" ${badge.transparent ? 'checked' : ''}> Remover fundo do círculo</label>
    <label class="flyer-check"><input type="checkbox" name="badgeBorder" ${badge.border ? 'checked' : ''}> Mostrar borda</label>
    <div class="flyer-two-fields"><label>Cor da borda<input type="color" name="badgeBorderColor" value="${badge.borderColor}"></label><label>Espessura da borda (px)<input type="number" name="badgeBorderWidth" min="0" max="30" step="1" value="${badge.borderWidth}"></label></div>`;
}

export function applyPriceBadgeControls(item, data, form) {
  item.priceBadge = normalizePriceBadge({
    fill: data.badgeFill, transparent: form.elements.badgeTransparent.checked,
    border: form.elements.badgeBorder.checked, borderColor: data.badgeBorderColor,
    borderWidth: Number(data.badgeBorderWidth), unit: data.badgeUnit,
  });
  item.fontFamily = data.fontFamily;
  item.fontWeight = Number(data.fontWeight);
  item.color = data.color;
}
