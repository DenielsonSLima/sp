const hex = (value, fallback) => /^#[\da-f]{6}$/i.test(value || '') ? value : fallback;
export const PRICE_BADGE_COLORS = { fill: '#b51a00', border: '#5c0701' };
export function normalizePriceBadge(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const width = Number(value.borderWidth);
  return {
    fill: hex(value.fill, PRICE_BADGE_COLORS.fill),
    transparent: value.transparent === true,
    border: value.border !== false,
    borderColor: hex(value.borderColor, PRICE_BADGE_COLORS.border),
    borderWidth: Number.isFinite(width) ? Math.max(0, Math.min(30, width)) : 4,
    unit: String(value.unit ?? 'cada').slice(0, 40),
  };
}

// Upgrade only recognized scene layers, explicitly requested from the inspector.
export function legacyBadgeParts(design, price) {
  if (price?.offerField !== 'price' || price.priceBadge || price.locked) return null;
  const cx = price.x + price.width / 2, cy = price.y + price.height / 2;
  const circle = design.elements.find(e => e.type === 'shape' && /^Selo do preço \d+$/.test(e.label) &&
    e.shapeKind === 'ellipse' && !e.locked && !e.hidden && cx >= e.x && cx <= e.x + e.width && cy >= e.y && cy <= e.y + e.height);
  if (!circle) return null;
  const suffix = circle.label.match(/\d+$/)[0];
  const rim = design.elements.find(e => e.type === 'shape' && e.label === `Filete do preço ${suffix}` &&
    e.shapeKind === 'ellipse' && !e.locked && !e.hidden && Math.abs(e.x + e.width / 2 - (circle.x + circle.width / 2)) < 3 &&
    Math.abs(e.y + e.height / 2 - (circle.y + circle.height / 2)) < 3);
  const unit = design.elements.find(e => e.offerField === 'unit' && e.offerProductId === price.offerProductId && !e.locked);
  return { circle, rim, unit };
}

export function upgradePriceBadge(design, priceId) {
  const price = design.elements.find(e => e.id === priceId);
  const parts = legacyBadgeParts(design, price);
  if (!parts) return false;
  const { circle, rim, unit } = parts, bounds = rim || circle;
  Object.assign(price, {
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    rotation: circle.rotation || 0,
    priceBadge: normalizePriceBadge({ fill: circle.fill, border: !!rim,
      borderColor: rim?.fill, borderWidth: rim ? Math.max(1, rim.width - circle.width) / 2 : 4,
      unit: unit?.hidden ? '' : unit?.text ?? '' }),
  });
  const removed = new Set([circle.id, rim?.id, unit?.id]);
  design.elements = design.elements.filter(e => !removed.has(e.id));
  return true;
}

// Uses measured text widths, so long prices shrink together without leaving the circle.
export function priceBadgeLayout(ctx, element) {
  const size = Math.min(element.width, element.height);
  const value = String(element.text || '').replace(/^R\$\s*/i, '').trim() || '—,—';
  const numeric = /^(\d[\d.]*|—),(\d{1,2}|—)$/.exec(value);
  const parts = [
    { text: 'R$', size: size * .115, role: 'currency' },
    { text: numeric ? numeric[1] : value, size: size * .46, role: 'integer' },
    ...(numeric ? [{ text: `,${numeric[2]}`, size: size * .23, role: 'cents' }] : []),
  ];
  const gapAfter = index => index === parts.length - 1 ? 0 : size * (index === 0 ? .012 : .003);
  const measure = part => {
    ctx.font = `${element.fontWeight || 900} ${part.size}px "${element.fontFamily || 'Trebuchet MS'}"`;
    const metrics = ctx.measureText(part.text);
    const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    const hasInk = Number.isFinite(inkWidth) && inkWidth > 0;
    part.offset = hasInk ? metrics.actualBoundingBoxLeft : 0;
    return hasInk ? inkWidth : metrics.width;
  };
  const rawWidth = parts.reduce((total, part, index) => total + measure(part) + gapAfter(index), 0);
  const factor = Math.min(1, size * .83 / rawWidth);
  const totalWidth = rawWidth * factor;
  let x = (element.width - totalWidth) / 2;
  for (const [index, part] of parts.entries()) {
    part.size *= factor;
    part.x = x;
    part.y = element.height * (part.role === 'cents' ? .44 : .51);
    part.width = measure(part);
    x += part.width + gapAfter(index) * factor;
  }
  return parts;
}

export function drawPriceBadge(ctx, element) {
  const badge = normalizePriceBadge(element.priceBadge);
  const { width, height } = element;
  const line = badge.border ? Math.min(badge.borderWidth, width / 4, height / 4) : 0;
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, Math.max(.1, (width - line) / 2), Math.max(.1, (height - line) / 2), 0, 0, Math.PI * 2);
  if (!badge.transparent) { ctx.fillStyle = badge.fill; ctx.fill(); }
  if (line > 0) { ctx.strokeStyle = badge.borderColor; ctx.lineWidth = line; ctx.stroke(); }
  ctx.fillStyle = element.color || '#fffaf1';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const part of priceBadgeLayout(ctx, element)) {
    ctx.font = `${element.fontWeight || 900} ${part.size}px "${element.fontFamily || 'Trebuchet MS'}"`;
    ctx.fillText(part.text, part.x + part.offset, part.y);
  }
  if (badge.unit) {
    let size = Math.min(width, height) * .10;
    ctx.font = `400 ${size}px "${element.fontFamily || 'Trebuchet MS'}"`;
    size *= Math.min(1, width * .68 / Math.max(1, ctx.measureText(badge.unit).width));
    ctx.font = `400 ${size}px "${element.fontFamily || 'Trebuchet MS'}"`;
    ctx.textAlign = 'center';
    ctx.fillText(badge.unit, width / 2, height * .75);
  }
}
