export const MIN_ZOOM = 10;
export const MAX_ZOOM = 300;
export const ZOOM_OPTIONS = [
  ['fit', 'Ajustar'],
  ...[10, 25, 50, 75, 100, 150, 200, 300].map((value) => [String(value), `${value}%`]),
];

export function normalizeZoom(value) {
  if (value === 'fit') return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return String(Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, numeric)) * 10) / 10);
}

export function wheelZoom(currentPercent, deltaY, deltaMode = 0, pageHeight = 800) {
  if (!Number.isFinite(deltaY) || !deltaY) return normalizeZoom(currentPercent);
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1);
  const bounded = Math.max(-120, Math.min(120, pixels));
  return normalizeZoom(currentPercent * Math.exp(-bounded * 0.002));
}

// This changes viewport state only: zoom never creates an artwork history entry.
export function bindStudioZoom(root, { renderer, state }) {
  const stage = root.querySelector('.flyer-stage');
  const board = root.querySelector('.flyer-artboard');
  if (!stage || !board) return () => {};
  const controls = [...root.querySelectorAll('.flyer-zoom-select')];
  const win = root.ownerDocument.defaultView || globalThis;
  let active = true, anchorFrame = null;

  const reflect = () => {
    const current = normalizeZoom(state.zoom) || 'fit';
    controls.forEach((control) => {
      const custom = control.querySelector('[data-zoom-current]');
      const preset = ZOOM_OPTIONS.some(([value]) => value === current);
      if (custom) {
        custom.hidden = preset;
        custom.value = preset ? 'custom' : current;
        custom.textContent = preset ? '' : `${current}%`;
      }
      control.value = current;
    });
  };
  const apply = (value, pointer) => {
    const next = normalizeZoom(value);
    if (!active || root.isConnected === false || !next || next === state.zoom) return;
    const before = board.getBoundingClientRect();
    const viewport = stage.getBoundingClientRect();
    const point = pointer || {
      x: viewport.left + stage.clientLeft + stage.clientWidth / 2,
      y: viewport.top + stage.clientTop + stage.clientHeight / 2,
    };
    const x = before.width > 0 ? (point.x - before.left) / before.width : 0.5;
    const y = before.height > 0 ? (point.y - before.top) / before.height : 0.5;
    state.zoom = next;
    reflect();
    renderer.requestDraw();
    if (anchorFrame !== null) win.cancelAnimationFrame(anchorFrame);
    // The renderer updates board geometry at the beginning of its queued frame.
    anchorFrame = win.requestAnimationFrame(() => {
      anchorFrame = null;
      if (!active || root.isConnected === false) return;
      const after = board.getBoundingClientRect();
      stage.scrollLeft += after.left + x * after.width - point.x;
      stage.scrollTop += after.top + y * after.height - point.y;
    });
  };
  const change = (event) => apply(event.currentTarget.value);
  controls.forEach((control) => control.addEventListener('change', change));
  const wheel = (event) => {
    if (!active || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const measured = board.getBoundingClientRect().width / state.design.width * 100;
    const current = state.zoom === 'fit' ? measured : Number(state.zoom);
    if (!(current > 0) || !Number.isFinite(current)) return;
    event.preventDefault();
    apply(wheelZoom(current, event.deltaY, event.deltaMode, stage.clientHeight), {
      x: event.clientX,
      y: event.clientY,
    });
  };
  stage.addEventListener('wheel', wheel, { passive: false });
  reflect();
  return () => {
    active = false;
    controls.forEach((control) => control.removeEventListener('change', change));
    stage.removeEventListener('wheel', wheel);
    if (anchorFrame !== null) win.cancelAnimationFrame(anchorFrame);
  };
}
