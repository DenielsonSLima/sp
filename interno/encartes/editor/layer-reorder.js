/** Move one layer without swapping or reversing the layers between its positions. */
export function moveLayer(elements, id, offset) {
  const index = elements.findIndex((element) => element.id === id);
  const next = index + offset;
  if (!Number.isInteger(offset) || !offset || index < 0 || next < 0 || next >= elements.length) return false;
  const [element] = elements.splice(index, 1);
  elements.splice(next, 0, element);
  return true;
}

/** The panel displays the document stack in reverse order (front to back). */
export function layerDropOffset(rows, id, clientY) {
  const source = rows.findIndex((row) => row.dataset.id === id);
  if (source < 0) return 0;
  const target = rows.filter((row) => row.dataset.id !== id).filter((row) => {
    const bounds = row.getBoundingClientRect();
    return clientY > bounds.top + bounds.height / 2;
  }).length;
  return source - target;
}

export function bindLayerReorder(list, { onMove, onSelect }) {
  const doc = list.ownerDocument, win = doc.defaultView;
  let drag = null, frame = null, suppressClick = false, clickTimer = null;
  const rows = () => [...list.querySelectorAll('.studio-layer-row')];
  const clearMarkers = () => {
    for (const row of rows()) row.classList.remove('layer-drop-before', 'layer-drop-after');
  };
  const inside = () => {
    const bounds = list.getBoundingClientRect();
    return drag.x >= bounds.left && drag.x <= bounds.right && drag.y >= bounds.top && drag.y <= bounds.bottom;
  };
  const mark = () => {
    clearMarkers();
    if (!inside()) return;
    const entries = rows();
    drag.offset = layerDropOffset(entries, drag.id, drag.y);
    if (!drag.offset) return;
    const others = entries.filter((row) => row.dataset.id !== drag.id);
    const target = entries.findIndex((row) => row.dataset.id === drag.id) - drag.offset;
    const after = target === others.length;
    const row = others[after ? target - 1 : target];
    row?.classList.add(after ? 'layer-drop-after' : 'layer-drop-before');
  };
  const scroll = () => {
    frame = null;
    if (!drag?.active) return;
    const bounds = list.getBoundingClientRect();
    if (inside()) {
      const edge = Math.min(32, bounds.height / 4);
      const step = drag.y < bounds.top + edge ? -10 : drag.y > bounds.bottom - edge ? 10 : 0;
      if (step) list.scrollTop += step;
      mark();
    }
    frame = win.requestAnimationFrame(scroll);
  };
  const down = (event) => {
    if (event.button !== 0 || event.isPrimary === false || drag) return;
    const select = event.target.closest('.studio-layer-select');
    const row = select?.closest('.studio-layer-row');
    if (!row || !list.contains(row)) return;
    drag = { id: row.dataset.id, row, pointerId: event.pointerId, startX: event.clientX,
      startY: event.clientY, x: event.clientX, y: event.clientY, active: false, offset: 0 };
  };
  const move = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
    if (!drag.active) {
      drag.active = true;
      drag.row.classList.add('is-reordering');
      list.classList.add('is-reordering');
      list.setPointerCapture(event.pointerId);
      frame = win.requestAnimationFrame(scroll);
    }
    event.preventDefault();
    mark();
  };
  const finish = (event, cancelled = false) => {
    if (!drag || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
    const current = drag;
    if (current.active && !cancelled) {
      current.x = event.clientX;
      current.y = event.clientY;
      mark();
    }
    const commit = current.active && !cancelled && inside() && current.offset;
    drag = null;
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    clearMarkers();
    current.row.classList.remove('is-reordering');
    list.classList.remove('is-reordering');
    if (list.hasPointerCapture(current.pointerId)) list.releasePointerCapture(current.pointerId);
    if (current.active) {
      suppressClick = true;
      win.clearTimeout(clickTimer);
      clickTimer = win.setTimeout(() => { suppressClick = false; }, 0);
    }
    if (commit) {
      onSelect(current.id);
      onMove(current.id, current.offset);
    }
  };
  const up = (event) => finish(event);
  const cancel = (event) => finish(event, true);
  const key = (event) => {
    if (drag?.active && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish({}, true);
    }
  };
  const click = (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const nativeDrag = (event) => event.preventDefault();
  list.addEventListener('pointerdown', down);
  doc.addEventListener('pointermove', move, { passive: false });
  doc.addEventListener('pointerup', up);
  doc.addEventListener('pointercancel', cancel);
  list.addEventListener('lostpointercapture', cancel);
  doc.addEventListener('keydown', key, true);
  list.addEventListener('click', click, true);
  list.addEventListener('dragstart', nativeDrag);
  return () => {
    finish({}, true);
    win.clearTimeout(clickTimer);
    list.removeEventListener('pointerdown', down);
    doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerup', up);
    doc.removeEventListener('pointercancel', cancel);
    list.removeEventListener('lostpointercapture', cancel);
    doc.removeEventListener('keydown', key, true);
    list.removeEventListener('click', click, true);
    list.removeEventListener('dragstart', nativeDrag);
  };
}
