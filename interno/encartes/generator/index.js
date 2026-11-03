import { createDesign, validateDesign } from '../model.js';
import { formatBRLCents } from '../../../shared/components/currency-input/index.js';
import { FLYER_FORMATS, FLYER_TEMPLATES, FLYER_THEMES, flyerOption } from './options.js';

export { FLYER_FORMATS, FLYER_TEMPLATES, FLYER_THEMES } from './options.js';

const text = (id, value, box, options = {}) => ({
  id, type: 'text', label: id, text: value, ...box, locked: false,
  fontFamily: 'Arial', fontSize: 28, fontWeight: 700, color: '#281c20',
  align: 'left', autoFit: true, ...options,
});
const shape = (id, box, fill, radius = 0) => ({
  id, type: 'shape', label: id, ...box, locked: false,
  shapeKind: radius ? 'rounded' : 'rectangle', radius, fill,
});
const box = (x, y, width, height) => ({ x, y, width, height });

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

function header(design, campaign, theme, margin, height, { logo, storeName }, validity, pageIndex, totalPages) {
  const { width, height: pageHeight } = design, unit = width / 1080;
  const elements = [
    shape('cabecalho', box(0, 0, width, height), theme.primary),
    shape('faixa-do-tema', box(0, height - 9 * unit, width, 9 * unit), theme.accent),
    shape('rodape', box(0, pageHeight - 65 * unit, width, 65 * unit), theme.secondary),
  ];
  let headingX = margin;
  if (logo) {
    const logoWidth = 210 * unit;
    elements.push(
      shape('fundo-da-marca', box(margin, 27 * unit, logoWidth, height - 57 * unit), '#ffffff', 15 * unit),
      { id: 'marca-da-loja', type: 'image', label: 'Logotipo', src: logo, fit: 'contain', locked: false,
        ...box(margin + 13 * unit, 39 * unit, logoWidth - 26 * unit, height - 81 * unit) },
    );
    headingX += logoWidth + 25 * unit;
  }
  elements.push(
    text('nome-da-loja', storeName || 'Supermercado do Povo',
      box(headingX, 23 * unit, width - headingX - margin, 26 * unit),
      { color: theme.accent, fontSize: 21 * unit, fontWeight: 700 }),
    text('nome-da-promocao', campaign.name,
      box(headingX, 58 * unit, width - headingX - margin, height - 80 * unit),
      { color: '#ffffff', fontSize: 54 * unit, fontWeight: 900 }),
    text('validade-da-promocao', validity,
      box(margin, pageHeight - 43 * unit, width - margin * 2 - 155 * unit, 27 * unit),
      { color: '#ffffff', fontSize: 19 * unit, fontWeight: 500 }),
    text('numero-da-pagina', `${pageIndex + 1} / ${totalPages}`,
      box(width - margin - 135 * unit, pageHeight - 43 * unit, 135 * unit, 27 * unit),
      { color: '#ffffff', fontSize: 20 * unit, align: 'right' }),
  );
  return elements;
}

function productElements(item, index, placement, theme, image) {
  const { x, y, width, height } = placement, prefix = `produto-${index + 1}`;
  const pad = Math.max(12, Math.min(width, height) * .055);
  const innerWidth = width - pad * 2, innerHeight = height - pad * 2;
  const nameFraction = item.displayName.length > 130 ? .36 : item.displayName.length > 70 ? .27 : .21;
  const photoHeight = innerHeight * (.74 - nameFraction), nameHeight = innerHeight * nameFraction;
  const nameY = y + pad + photoHeight + innerHeight * .025;
  const priceY = nameY + nameHeight + innerHeight * .015;
  const priceHeight = innerHeight * .145, unitHeight = innerHeight * .055;
  const linked = (field) => ({ offerProductId: item.productId, offerField: field });
  const elements = [
    shape(`${prefix}-borda`, placement, theme.accent, 16),
    shape(`${prefix}-cartao`, box(x + 2, y + 2, width - 4, height - 4), '#ffffff', 14),
  ];
  if (image) elements.push({
    id: `${prefix}-foto`, type: 'image', label: `Foto: ${item.name}`, src: image,
    ...box(x + pad, y + pad, innerWidth, photoHeight), fit: 'contain', locked: false,
  });
  else elements.push(text(`${prefix}-sem-foto`, 'Imagem não cadastrada',
    box(x + pad, y + pad + photoHeight * .4, innerWidth, photoHeight * .25),
    { color: '#737373', fontSize: Math.min(24, width * .06), align: 'center', fontWeight: 400 }));
  elements.push(
    text(`${prefix}-nome`, item.displayName, box(x + pad, nameY, innerWidth, nameHeight),
      { color: theme.ink, fontSize: Math.min(36, width * .085, nameHeight * .46), align: 'center', ...linked('name') }),
    text(`${prefix}-preco`, item.priceText, box(x + pad, priceY, innerWidth, priceHeight),
      { color: theme.primary, fontSize: Math.min(88, width * .18, priceHeight * .8), fontWeight: 900,
        align: 'center', ...linked('price') }),
    text(`${prefix}-unidade`, `por ${item.unit}`, box(x + pad, priceY + priceHeight, innerWidth, unitHeight),
      { color: theme.ink, fontSize: Math.min(22, width * .065, unitHeight * .8), fontWeight: 500,
        align: 'center', ...linked('unit') }),
  );
  return elements;
}

/**
 * Compose editable pages using saved offer values and already materialized images.
 * This function performs no network access, price calculation, persistence or AI call.
 * Images are keyed by productId (Map or plain object); absent photos stay explicit.
 */
export function generateFlyerPages(campaign, {
  templateId = 'grid-6', themeId = 'povo', formatId = 'portrait', photos = {},
  logo = './assets/logo-original.jpg', storeName = 'Supermercado do Povo',
} = {}) {
  const items = campaignItems(campaign), validity = campaignValidityLabel(campaign);
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
    design.elements = header(design, campaign, theme, margin, headerHeight,
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
