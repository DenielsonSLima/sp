import { newId } from '../model.js';
import { formatOfferPrice } from '../price-format.js';
import { PRICE_BADGE_COLORS } from '../price-badge.js';

// Editable artwork, independent of the photograph and of catalog persistence.
// Product identity is supplied by the gallery's existing SKU bindings, not OCR.
const palette = {
  pine: '#183f35',
  cream: '#fffaf1',
};

function priceText(product) {
  const supplied = typeof product.priceText === 'string' ? product.priceText.trim().slice(0, 40) : '';
  if (supplied) return `R$ ${formatOfferPrice(supplied)}`;
  if (Number.isSafeInteger(product.priceCents) && product.priceCents >= 0) {
    return `R$ ${(product.priceCents / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return 'R$ —,—';
}

function unitText(product) {
  const unit = String(product.unit || '').trim();
  if (/^kg$/i.test(unit)) return 'por kg';
  if (/^(un|und|unid|unidade)$/i.test(unit)) return 'cada';
  return unit.slice(0, 40);
}

// Reference coordinates are always 1080 × 1920; each scene can place its own offers.
const fallbackPositions = {
  1: [
    { name: { x: 570, y: 130, width: 450, height: 180 }, badge: { x: 650, y: 330, size: 300 } },
  ],
  2: [
    { name: { x: 90, y: 100, width: 410, height: 140 }, badge: { x: 150, y: 260, size: 245 } },
    { name: { x: 590, y: 100, width: 400, height: 140 }, badge: { x: 680, y: 260, size: 245 } },
  ],
  3: [
    { name: { x: 65, y: 100, width: 420, height: 150 }, badge: { x: 150, y: 270, size: 240 } },
    { name: { x: 595, y: 280, width: 420, height: 150 }, badge: { x: 675, y: 450, size: 240 } },
    { name: { x: 65, y: 1280, width: 420, height: 150 }, badge: { x: 150, y: 1450, size: 240 } },
  ],
  4: [
    { name: { x: 65, y: 100, width: 420, height: 150 }, badge: { x: 150, y: 270, size: 240 } },
    { name: { x: 595, y: 180, width: 420, height: 150 }, badge: { x: 675, y: 350, size: 240 } },
    { name: { x: 65, y: 1250, width: 420, height: 150 }, badge: { x: 150, y: 1420, size: 240 } },
    { name: { x: 595, y: 1330, width: 420, height: 150 }, badge: { x: 675, y: 1500, size: 240 } },
  ],
};

function positionFor(products, product, index, positions) {
  const fallback = fallbackPositions[products.length][index];
  const supplied = Array.isArray(positions) ? positions[index] : positions?.[product.id];
  const name = { ...fallback.name, ...supplied?.name };
  const badge = { ...fallback.badge, ...supplied?.badge };
  const boxes = [name, { x: badge.x, y: badge.y, width: badge.size, height: badge.size }];
  for (const box of boxes) {
    if (!['x', 'y', 'width', 'height'].every((key) => Number.isFinite(box[key])) ||
        box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 ||
        box.x + box.width > 1080 || box.y + box.height > 1920)
      throw Error('A posição da oferta deve ficar dentro da fotografia.');
  }
  return { name, badge };
}

export function createSceneOfferElements(design, products, positions) {
  if (!Array.isArray(products) || products.length < 1 || products.length > 4)
    throw Error('O cenário deve ter de um a quatro produtos.');
  if (products.some((product) => !product || !product.id || typeof product.name !== 'string' || !product.name.trim()))
    throw Error('Os produtos do cenário precisam estar identificados no catálogo.');

  const sx = design.width / 1080, sy = design.height / 1920;
  const elements = [];
  const geometry = (x, y, width, height) => ({
    x: x * sx, y: y * sy, width: width * sx, height: height * sy,
  });
  const text = (label, value, x, y, width, height, size, options = {}) => ({
    id: newId(), type: 'text', label, locked: false,
    ...geometry(x, y, width, height),
    text: value, fontFamily: 'Trebuchet MS', fontSize: size * sx,
    fontWeight: 700, color: palette.cream, align: 'center', autoFit: true,
    ...options,
  });

  products.forEach((product, index) => {
    const placement = positionFor(products, product, index, positions);
    const description = product.name.trim().replace(/\s+/g, ' ').slice(0, 180);
    const linked = (field) => ({ offerField: field, offerProductId: product.id });
    const { x, y, size } = placement.badge;
    const name = placement.name;
    elements.push(
      text(`Descrição: ${description}`, description, name.x, name.y, name.width, name.height,
        30, {
          color: '#ffffff', shadow: true, strokeColor: palette.pine, strokeWidth: 1.2 * sx,
          ...linked('name'),
        }),
      text(`Preço: ${description}`, priceText(product), x, y, size, size, size * .46, {
        fontWeight: 900, ...linked('price'),
        priceBadge: { fill: PRICE_BADGE_COLORS.fill, border: true, borderColor: PRICE_BADGE_COLORS.border,
          borderWidth: 4, transparent: false, unit: unitText(product) },
      }),
    );
  });
  return elements;
}
