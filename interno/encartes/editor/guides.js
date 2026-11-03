/** Values are document pixels, independent of zoom, viewport scroll and DPR. */
export function normalizeGuides(guides = {}, { width, height }) {
  const values = (axis, extent) =>
    [...new Set((guides[axis] || []).filter((value) => Number.isFinite(value) && value >= 0 && value <= extent))].sort(
      (a, b) => a - b,
    );
  return { x: values("x", width), y: values("y", height) };
}

export function guidePositions(guides, width, height, showCenter = true) {
  return normalizeGuides(
    {
      x: [...(guides?.x || []), ...(showCenter && width > 0 ? [width / 2] : [])],
      y: [...(guides?.y || []), ...(showCenter && height > 0 ? [height / 2] : [])],
    },
    { width, height },
  );
}

/** The measured board incorporates centering, fractional zoom and pan. */
export function pointerToGuide({ axis, clientX, clientY, bounds, width, height }) {
  if (!bounds || !(bounds.width > 0 && bounds.height > 0) || !["x", "y"].includes(axis)) return null;
  const value =
    axis === "x" ? ((clientX - bounds.left) * width) / bounds.width : ((clientY - bounds.top) * height) / bounds.height;
  const inside =
    clientX >= bounds.left &&
    clientX <= bounds.left + bounds.width &&
    clientY >= bounds.top &&
    clientY <= bounds.top + bounds.height;
  return { value: Math.round(value), inside };
}

/**
 * update restores per-art state without notifying; user edits call
 * onChange({guides:{x:[],y:[]},showCenter}). No guides enter the exported canvas.
 */
export function createGuides(stage, { onChange = () => {} } = {}) {
  const doc = stage.ownerDocument,
    win = doc.defaultView;
  const overlay = doc.createElement("div");
  overlay.className = "flyer-guides";
  const plane = doc.createElement("div");
  plane.className = "flyer-guide-plane";
  overlay.append(plane);
  stage.append(overlay);
  let state = { width: 0, height: 0, scale: 1, guides: { x: [], y: [] }, showCenter: true };
  let drag = null,
    frame = null,
    disposed = false,
    observedBoard;
  let snapLines = { x: [], y: [] };
  const nodes = new Map();
  const observer = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  observer?.observe(stage);
  const boardElement = () => state.board || stage.querySelector(".flyer-artboard");
  const notify = () =>
    onChange({ guides: { x: [...state.guides.x], y: [...state.guides.y] }, showCenter: state.showCenter });

  function schedule() {
    if (!disposed && frame === null) frame = win.requestAnimationFrame(draw);
  }
  function point(event, axis) {
    return pointerToGuide({
      ...state,
      axis,
      clientX: event.clientX,
      clientY: event.clientY,
      bounds: boardElement()?.getBoundingClientRect(),
    });
  }
  function begin(event, axis, index = null) {
    if ((event.button !== undefined && event.button !== 0) || disposed || drag) return;
    const position = point(event, axis);
    if (!position) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    stage.focus?.({ preventScroll: true });
    drag = { axis, index, pointerId: event.pointerId, ...position };
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      /* Synthetic events need no capture. */
    }
    schedule();
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const position = point(event, drag.axis);
    if (position) Object.assign(drag, position);
    schedule();
  }
  function finish(event, cancelled = false) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!cancelled) move(event);
    const current = drag;
    drag = null;
    try {
      stage.releasePointerCapture(current.pointerId);
    } catch {
      /* Capture may already have ended. */
    }
    if (!cancelled) {
      const values = [...state.guides[current.axis]];
      if (current.index !== null) values.splice(current.index, 1);
      if (current.inside) values.push(current.value);
      const next = normalizeGuides({ ...state.guides, [current.axis]: values }, state);
      if (JSON.stringify(next) !== JSON.stringify(state.guides)) {
        state.guides = next;
        notify();
      }
    }
    schedule();
  }
  function fromRuler(event) {
    begin(event.detail, event.detail.axis);
  }
  function pointerUp(event) {
    finish(event);
  }
  function pointerCancel(event) {
    finish(event, true);
  }
  function keydown(event) {
    if (event.key === "Escape" && drag) {
      finish({ pointerId: drag.pointerId }, true);
      event.preventDefault();
      return;
    }
    const line = event.target.closest?.("[data-guide-axis]");
    if (!line || !plane.contains(line)) return;
    const axis = line.dataset.guideAxis,
      index = Number(line.dataset.guideIndex);
    const values = [...state.guides[axis]];
    if (event.key === "Delete" || event.key === "Backspace") values.splice(index, 1);
    else {
      const direction = axis === "x" ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
      if (!direction[event.key]) return;
      const extent = axis === "x" ? state.width : state.height;
      values[index] = Math.max(0, Math.min(extent, values[index] + direction[event.key] * (event.shiftKey ? 10 : 1)));
    }
    event.preventDefault();
    event.stopPropagation();
    state.guides = normalizeGuides({ ...state.guides, [axis]: values }, state);
    notify();
    schedule();
  }

  function draw() {
    frame = null;
    if (disposed || !stage.isConnected) return;
    const board = boardElement();
    if (observedBoard !== board) {
      if (observedBoard) observer?.unobserve(observedBoard);
      if (board) observer?.observe(board);
      observedBoard = board;
    }
    const bounds = board?.getBoundingClientRect(),
      viewport = stage.getBoundingClientRect();
    if (!bounds || state.width <= 0 || state.height <= 0) return;
    overlay.style.transform = `translate(${stage.scrollLeft}px, ${stage.scrollTop}px)`;
    overlay.style.width = `${stage.clientWidth}px`;
    overlay.style.height = `${stage.clientHeight}px`;
    Object.assign(plane.style, {
      left: `${bounds.left - viewport.left - stage.clientLeft}px`,
      top: `${bounds.top - viewport.top - stage.clientTop}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    });
    const active = new Set();
    function line(axis, value, key, kind, index) {
      active.add(key);
      let node = nodes.get(key);
      if (!node) {
        node = doc.createElement("div");
        nodes.set(key, node);
        plane.append(node);
      }
      node.className = `flyer-guide-line flyer-guide-${axis} ${kind}`;
      node.style[axis === "x" ? "left" : "top"] = `${(value / (axis === "x" ? state.width : state.height)) * 100}%`;
      node.dataset.label = `${kind === "is-center" ? "Centro · " : ""}${value} px`;
      if (index !== undefined) {
        node.dataset.guideAxis = axis;
        node.dataset.guideIndex = index;
        node.tabIndex = 0;
        node.setAttribute("role", "separator");
        node.setAttribute("aria-orientation", axis === "x" ? "vertical" : "horizontal");
        node.setAttribute(
          "aria-label",
          `Guia ${axis === "x" ? "vertical" : "horizontal"}. Setas movem; Delete remove.`,
        );
        node.setAttribute("aria-valuemin", "0");
        node.setAttribute("aria-valuemax", String(axis === "x" ? state.width : state.height));
        node.setAttribute("aria-valuenow", String(value));
        node.onpointerdown = (event) => begin(event, axis, index);
      } else node.setAttribute("aria-hidden", "true");
    }
    for (const axis of ["x", "y"]) {
      if (state.showCenter) line(axis, (axis === "x" ? state.width : state.height) / 2, `${axis}-center`, "is-center");
      state.guides[axis].forEach((value, index) => {
        if (drag?.axis === axis && drag.index === index) value = drag.value;
        line(axis, value, `${axis}-${index}`, drag?.axis === axis && drag.index === index ? "is-dragging" : "", index);
      });
      if (drag?.axis === axis && drag.index === null) line(axis, drag.value, "preview", "is-dragging");
      snapLines[axis].forEach((value, index) => line(axis, value, `${axis}-snap-${index}`, "is-snap"));
    }
    for (const [key, node] of nodes)
      if (!active.has(key)) {
        node.remove();
        nodes.delete(key);
      }
  }
  stage.addEventListener("flyer-guide-create", fromRuler);
  stage.addEventListener("scroll", schedule, { passive: true });
  stage.addEventListener("keydown", keydown);
  win.addEventListener("pointermove", move);
  win.addEventListener("pointerup", pointerUp);
  win.addEventListener("pointercancel", pointerCancel);
  win.addEventListener("resize", schedule, { passive: true });
  schedule();
  return {
    update(next) {
      state = { ...state, ...next };
      state.guides = normalizeGuides(state.guides, state);
      schedule();
    },
    getGuidePositions: () => guidePositions(state.guides, state.width, state.height, state.showCenter),
    setSnapLines(next = {}) {
      snapLines = normalizeGuides(next, state);
      schedule();
    },
    clear() {
      state.guides = { x: [], y: [] };
      notify();
      schedule();
    },
    setCenterVisible(visible) {
      state.showCenter = Boolean(visible);
      notify();
      schedule();
    },
    destroy() {
      disposed = true;
      if (drag) finish({ pointerId: drag.pointerId }, true);
      if (frame !== null) win.cancelAnimationFrame(frame);
      observer?.disconnect();
      stage.removeEventListener("flyer-guide-create", fromRuler);
      stage.removeEventListener("scroll", schedule);
      stage.removeEventListener("keydown", keydown);
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", pointerUp);
      win.removeEventListener("pointercancel", pointerCancel);
      win.removeEventListener("resize", schedule);
      overlay.remove();
    },
  };
}
