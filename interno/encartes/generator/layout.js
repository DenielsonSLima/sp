export const text = (id, value, box, options = {}) => ({
  id, type: 'text', label: id, text: value, ...box, locked: false,
  fontFamily: 'Arial', fontSize: 28, fontWeight: 700, color: '#281c20',
  align: 'left', autoFit: true, ...options,
});
export const shape = (id, box, fill, radius = 0) => ({
  id, type: 'shape', label: id, ...box, locked: false,
  shapeKind: radius ? 'rounded' : 'rectangle', radius, fill,
});
export const box = (x, y, width, height) => ({ x, y, width, height });

export function pageHeader(design, campaign, theme, margin, height, { logo, storeName }, validity, pageIndex, totalPages) {
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
      { color: '#ffffff', fontSize: 46 * unit, fontWeight: 900 }),
    text('validade-da-promocao', validity,
      box(margin, pageHeight - 43 * unit, width - margin * 2 - 155 * unit, 27 * unit),
      { color: '#ffffff', fontSize: 19 * unit, fontWeight: 500 }),
    text('numero-da-pagina', `${pageIndex + 1} / ${totalPages}`,
      box(width - margin - 135 * unit, pageHeight - 43 * unit, 135 * unit, 27 * unit),
      { color: '#ffffff', fontSize: 20 * unit, align: 'right' }),
  );
  return elements;
}

export function productElements(item, index, placement, theme, image, { blank = false } = {}) {
  const { x, y, width, height } = placement, prefix = `${blank ? 'slot' : 'produto'}-${index + 1}`;
  const pad = Math.max(10, Math.min(width, height) * .045);
  const innerWidth = width - pad * 2, innerHeight = height - pad * 2;
  const nameFraction = item.displayName.length > 130 ? .29 : item.displayName.length > 70 ? .22 : .15;
  const photoHeight = innerHeight * (.80 - nameFraction), nameHeight = innerHeight * nameFraction;
  const nameY = y + pad + photoHeight + innerHeight * .018;
  const priceY = nameY + nameHeight + innerHeight * .008;
  const priceHeight = innerHeight * .145, unitHeight = innerHeight * .05;
  const linked = (field) => blank ? {} : { offerProductId: item.productId, offerField: field };
  const elements = [
    shape(`${prefix}-borda`, placement, theme.accent, 16),
    shape(`${prefix}-cartao`, box(x + 2, y + 2, width - 4, height - 4), '#ffffff', 14),
  ];
  if (image || blank) elements.push({
    id: `${prefix}-foto`, type: 'image', label: blank ? `Foto do produto ${index + 1}` : `Foto: ${item.name}`,
    src: image || '', ...box(x + pad, y + pad, innerWidth, photoHeight), fit: 'contain', locked: false,
  });
  else elements.push(text(`${prefix}-sem-foto`, 'Imagem não cadastrada',
    box(x + pad, y + pad + photoHeight * .4, innerWidth, photoHeight * .25),
    { color: '#737373', fontSize: Math.min(24, width * .06), align: 'center', fontWeight: 400 }));
  elements.push(
    text(`${prefix}-nome`, item.displayName, box(x + pad, nameY, innerWidth, nameHeight),
      { label: `Nome do produto ${index + 1}`, color: theme.ink,
        fontSize: Math.min(27, width * .064, nameHeight * .48), align: 'center', ...linked('name') }),
    text(`${prefix}-preco`, item.priceText, box(x + pad, priceY, innerWidth, priceHeight),
      { label: `Preço do produto ${index + 1}`, color: theme.primary,
        fontSize: Math.min(80, width * .17, priceHeight * .8), fontWeight: 900, align: 'center', ...linked('price') }),
    text(`${prefix}-unidade`, blank ? 'Unidade' : `por ${item.unit}`,
      box(x + pad, priceY + priceHeight, innerWidth, unitHeight),
      { label: `Unidade do produto ${index + 1}`, color: theme.ink,
        fontSize: Math.min(19, width * .05, unitHeight * .8), fontWeight: 500, align: 'center', ...linked('unit') }),
  );
  return elements;
}
