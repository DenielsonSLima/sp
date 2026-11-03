import { createDesign, validateDesign } from '../model.js';
import { box, pageHeader, productElements } from './layout.js';
import { fillFlyerModel } from './model-fill.js';
import { formatBRLCents } from '../../../shared/components/currency-input/index.js';
import { FLYER_FORMATS, FLYER_TEMPLATES, FLYER_THEMES, flyerOption } from './options.js';

export { FLYER_FORMATS, FLYER_TEMPLATES, FLYER_THEMES } from './options.js';

function dateLabel(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw Error('A promoção precisa ter uma validade salva.');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw Error('A validade da promoção é inválida.');
  return value.split('-').reverse().join('/');
}

export function campaignValidityLabel(campaign) {
  if (campaign.omitValidity === true) return '';
  const start = dateLabel(campaign.start), end = dateLabel(campaign.end);
  return start === end ? `Ofertas válidas em ${start}` : `Ofertas válidas de ${start} a ${end}`;
}

function campaignItems(campaign) {
  if (!campaign || typeof campaign !== 'object' || !Array.isArray(campaign.items) || !campaign.items.length)
    throw Error('Selecione uma promoção salva com produtos.');
  if (typeof campaign.name !== 'string' || !campaign.name.trim())
    throw Error('A promoção precisa ter um nome salvo.');
  return campaign.items.map((item) => {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || !item.productId)
      throw Error('Um produto da promoção está incompleto. Atualize a promoção.');
    const name = typeof item.displayName === 'string' && item.displayName.trim() ? item.displayName : item.name;
    if (typeof item.unit !== 'string' || !item.unit.trim())
      throw Error(`A unidade de ${item.name} não está disponível na promoção.`);
    if (!Number.isSafeInteger(item.cents) || item.cents < 1)
      throw Error(`O preço de ${item.name} não está disponível na promoção.`);
    return { ...item, displayName: name, priceText: `R$ ${formatBRLCents(item.cents, Number.MAX_SAFE_INTEGER)}` };
  });
}

/**
 * Compose editable pages using saved offer values and already materialized images.
 * This function performs no network access, price calculation, persistence or AI call.
 * Images are keyed by productId (Map or plain object); absent photos stay explicit.
 */
export function generateFlyerPages(campaign, {
  templateId = 'grid-6', themeId = 'povo', formatId = 'portrait', photos = {},
  logo = './assets/logo-original.jpg', storeName = 'Supermercado do Povo', model,
} = {}) {
  const items = campaignItems(campaign), validity = campaignValidityLabel(campaign);
  if (model) return fillFlyerModel(model, campaign, items, { photos, validity });
  const template = flyerOption(FLYER_TEMPLATES, templateId, 'modelo');
  const theme = flyerOption(FLYER_THEMES, themeId, 'tema');
  const format = flyerOption(FLYER_FORMATS, formatId, 'formato');
  const totalPages = Math.ceil(items.length / template.perPage);
  return Array.from({ length: totalPages }, (_, pageIndex) => {
    const pageItems = items.slice(pageIndex * template.perPage, (pageIndex + 1) * template.perPage);
    const design = createDesign({ width: format.width, height: format.height,
      title: `${campaign.name.slice(0, 128)} · Página ${pageIndex + 1} de ${totalPages}` });
    design.bgColor = theme.background;
    const unit = format.width / 1080, margin = 34 * unit, gap = 18 * unit, headerHeight = 175 * unit;
    const top = headerHeight + 26 * unit, bottom = format.height - 88 * unit;
    const columns = Math.min(template.columns, pageItems.length), rows = Math.ceil(pageItems.length / columns);
    const width = (format.width - margin * 2 - gap * (columns - 1)) / columns;
    const height = (bottom - top - gap * (rows - 1)) / rows;
    design.elements = pageHeader(design, campaign, theme, margin, headerHeight,
      { logo, storeName }, validity, pageIndex, totalPages);
    pageItems.forEach((item, index) => {
      const image = photos instanceof Map ? photos.get(item.productId) : photos[item.productId];
      const placement = box(margin + (index % columns) * (width + gap),
        top + Math.floor(index / columns) * (height + gap), width, height);
      design.elements.push(...productElements(item, pageIndex * template.perPage + index, placement, theme, image || ''));
    });
    return validateDesign(design);
  });
}
