import { box, shape, text } from './layout.js';

/** The festive header reserves its right side for the supplied seasonal artwork. */
export function storyHeader(design, preset, { logo, storeName, headerAsset }) {
  const u = design.width / 1080, margin = 36 * u, headerHeight = 480 * u;
  const elements = [shape('cabecalho', box(0, 0, design.width, headerHeight), '#81101c')];
  if (headerAsset) elements.push({ id: 'arte-do-modelo', type: 'image', label: 'Ilustração do cabeçalho',
    src: headerAsset, fit: 'contain', ...box(0, 0, design.width, headerHeight), locked: false });
  elements.push(shape('faixa-do-tema', box(0, headerHeight - 8 * u, design.width, 8 * u), preset.accent));
  if (logo) elements.push(
    shape('fundo-da-marca', box(margin, 27 * u, 172 * u, 80 * u), '#ffffff', 12 * u),
    { id: 'marca-da-loja', type: 'image', label: 'Logotipo', src: logo, fit: 'contain', locked: false,
      ...box(margin + 9 * u, 34 * u, 154 * u, 66 * u) },
  );
  const storeX = logo ? margin + 188 * u : margin;
  elements.push(
    text('nome-da-loja', storeName || 'Supermercado do Povo', box(storeX, 42 * u, 370 * u, 52 * u),
      { fontSize: 24 * u, color: '#fff6dc', fontWeight: 700 }),
    text('titulo-do-modelo', preset.headline, box(margin, 144 * u, 605 * u, 190 * u),
      { fontSize: 73 * u, fontWeight: 900, color: '#ffe3a2', shadow: true }),
    text('nome-da-promocao', 'Título da promoção', box(margin, 369 * u, 580 * u, 62 * u),
      { fontSize: 30 * u, fontWeight: 700, color: '#ffffff' }),
    shape('rodape', box(0, design.height - 66 * u, design.width, 66 * u), preset.secondary),
    text('validade-da-promocao', 'Validade da promoção',
      box(margin, design.height - 45 * u, design.width - margin * 2 - 140 * u, 28 * u),
      { fontSize: 18 * u, fontWeight: 500, color: '#ffffff' }),
    text('numero-da-pagina', '1 / 1',
      box(design.width - margin - 120 * u, design.height - 45 * u, 120 * u, 28 * u),
      { fontSize: 19 * u, fontWeight: 700, color: '#ffffff', align: 'right' }),
  );
  return { elements, headerHeight };
}

/** Fixed slots keep names, photos and prices independent and fully editable. */
export function storyProductElements(index, placement, preset) {
  const { x, y, width, height } = placement, prefix = `slot-${index + 1}`;
  const pad = Math.max(9, Math.min(width, height) * .04), innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2, unitHeight = Math.max(11, innerHeight * .05);
  const nameHeight = innerHeight * .15, priceHeight = innerHeight * .18;
  const smallGap = innerHeight * .01;
  const photoHeight = innerHeight - nameHeight - priceHeight - unitHeight - smallGap * 2;
  const gifts = preset.layout === 'christmas-gifts', week = preset.layout === 'christmas-week';
  const cardFill = gifts ? '#f7fbe9' : '#fffdf5';
  const elements = [
    shape(`${prefix}-borda`, placement, week ? '#235337' : preset.accent, gifts ? 24 : 5),
    shape(`${prefix}-cartao`, box(x + 2, y + 2, width - 4, height - 4), cardFill, gifts ? 22 : 3),
  ];
  let photoY = y + pad, nameY = photoY + photoHeight + smallGap;
  let priceY = nameY + nameHeight + smallGap;
  if (gifts) {
    priceY = photoY + photoHeight + smallGap;
    nameY = priceY + priceHeight + smallGap;
  } else if (week) {
    nameY = y + pad;
    photoY = nameY + nameHeight + smallGap;
    priceY = photoY + photoHeight + smallGap;
  }
  const badgeWidth = innerWidth * (gifts ? .86 : .94), badgeX = x + (width - badgeWidth) / 2;
  const priceFill = week ? '#f5cf72' : gifts ? '#c6202e' : '#fff0c9';
  const priceColor = week ? '#853b11' : gifts ? '#ffffff' : '#ae1424';
  const unitY = y + pad + innerHeight - unitHeight;
  elements.push(
    { id: `${prefix}-foto`, type: 'image', label: `Foto do produto ${index + 1}`, src: '', fit: 'contain', locked: false,
      ...box(x + pad, photoY, innerWidth, photoHeight) },
    text(`${prefix}-nome`, 'Nome do produto', box(x + pad, nameY, innerWidth, nameHeight),
      { label: `Nome do produto ${index + 1}`, fontSize: Math.min(28, innerWidth * .065, nameHeight * .48),
        fontWeight: 700, color: preset.ink, align: 'center' }),
    shape(`${prefix}-selo-preco`, box(badgeX, priceY, badgeWidth, priceHeight), priceFill, gifts ? priceHeight / 2 : 6),
    text(`${prefix}-preco`, 'Preço', box(badgeX + 8, priceY + priceHeight * .07, badgeWidth - 16, priceHeight * .86),
      { label: `Preço do produto ${index + 1}`, fontSize: Math.min(58, priceHeight * .64),
        fontWeight: 900, color: priceColor, align: 'center' }),
    text(`${prefix}-unidade`, 'Unidade', box(x + pad, unitY, innerWidth, unitHeight),
      { label: `Unidade do produto ${index + 1}`, fontSize: Math.min(18, unitHeight * .78),
        fontWeight: 500, color: preset.ink, align: 'center' }),
  );
  return elements;
}
