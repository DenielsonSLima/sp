/** Canvas pixels follow the visible artwork size and screen density, not a fixed thumbnail cap. */
export function previewRasterScale(design, { width, height, pixelRatio = globalThis.devicePixelRatio || 1, minimumScale = 0 }) {
  if (![design?.width, design?.height, width, height].every(value => Number.isFinite(value) && value > 0))
    throw Error('Dimensões da prévia inválidas.');
  const density = Number.isFinite(pixelRatio) && pixelRatio > 0 ? Math.max(1, pixelRatio) : 1;
  let scale = Math.max(Number.isFinite(minimumScale) && minimumScale > 0 ? minimumScale : 0,
    Math.min(width / design.width, height / design.height) * density);
  scale = Math.min(scale, 4096 / design.width, 4096 / design.height,
    Math.sqrt(16000000 / (design.width * design.height)));
  // Rounding either side up must not cross the renderer's pixel budget.
  while (Math.round(design.width * scale) * Math.round(design.height * scale) > 16000000)
    scale -= 1 / Math.max(design.width, design.height);
  return scale;
}

/** Read the CSS content width rather than the canvas's temporary intrinsic bitmap width. */
export function previewContentWidth(element, fallback = 320) {
  if (!element) return fallback;
  const view = element.ownerDocument?.defaultView;
  const style = view?.getComputedStyle(element);
  const padding = (Number.parseFloat(style?.paddingLeft) || 0) + (Number.parseFloat(style?.paddingRight) || 0);
  return Math.max(1, (element.clientWidth || fallback) - padding);
}
