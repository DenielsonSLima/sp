const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const emptyLines = () => ({ x: [], y: [] });

// Elements rotate about their center in both renderer.js and Konva.
export function visualBBox(element) {
  const radians = ((element.rotation || 0) * Math.PI) / 180,
    cos = Math.abs(Math.cos(radians)),
    sin = Math.abs(Math.sin(radians)),
    width = element.width * cos + element.height * sin,
    height = element.width * sin + element.height * cos;
  return {
    x: element.x + (element.width - width) / 2,
    y: element.y + (element.height - height) / 2,
    width,
    height,
  };
}

function snapAxis(position, maxPosition, start, length, guides, tolerance) {
  const anchors = [start, start + length / 2, start + length];
  let nearest = null;
  for (const guide of guides) {
    for (const anchor of anchors) {
      const delta = guide - anchor,
        next = position + delta;
      // Respect the same intrinsic element bounds as validateDesign().
      if (next < -1e-7 || next > maxPosition + 1e-7 || Math.abs(delta) > tolerance) continue;
      if (!nearest || Math.abs(delta) < Math.abs(nearest.delta)) nearest = { delta };
    }
  }
  if (!nearest) return { position, lines: [] };
  return {
    position: clamp(position + nearest.delta, 0, maxPosition),
    lines: guides.filter((guide) => anchors.some((anchor) => Math.abs(guide - anchor - nearest.delta) < 1e-6)),
  };
}

/** Snap visual edges/center using a tolerance measured in CSS pixels at every zoom. */
export function snapElementPosition(
  element,
  design,
  { guides = {}, scale = 1, tolerance = 6, disabled = false, box = visualBBox(element) } = {},
) {
  if (element.locked) return { x: element.x, y: element.y, lines: emptyLines() };
  const maxX = Math.max(0, design.width - element.width),
    maxY = Math.max(0, design.height - element.height),
    x = clamp(element.x, 0, maxX),
    y = clamp(element.y, 0, maxY);
  if (disabled) return { x, y, lines: emptyLines() };
  const distance = Math.max(0, tolerance) / (Number.isFinite(scale) && scale > 0 ? scale : 1);
  const targets = (custom, size) =>
    [...new Set([...(custom || []), 0, size / 2, size])].filter(
      (value) => Number.isFinite(value) && value >= 0 && value <= size,
    );
  const horizontal = snapAxis(x, maxX, box.x + x - element.x, box.width, targets(guides.x, design.width), distance),
    vertical = snapAxis(y, maxY, box.y + y - element.y, box.height, targets(guides.y, design.height), distance);
  return { x: horizontal.position, y: vertical.position, lines: { x: horizontal.lines, y: vertical.lines } };
}

/** Center a single editable layer; preserve geometry, rotation and unrelated layers. */
export function centralizeElement(design, id, axis = 'both') {
  if (!['both', 'x', 'y', 'horizontal', 'vertical'].includes(axis)) throw Error('Eixo de alinhamento inválido.');
  const next = structuredClone(design),
    element = next.elements.find((item) => item.id === id);
  if (!element || element.locked) return next;
  if (['both', 'x', 'horizontal'].includes(axis)) element.x = (next.width - element.width) / 2;
  if (['both', 'y', 'vertical'].includes(axis)) element.y = (next.height - element.height) / 2;
  return next;
}
