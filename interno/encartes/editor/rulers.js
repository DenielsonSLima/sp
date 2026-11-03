const THICKNESS = 22;

/** Keep labels at a readable distance while using round document-pixel intervals. */
export function rulerInterval(scale, minSpacing = 72) {
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const target = minSpacing / scale;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const factor = [1, 2, 5, 10].find((value) => value * magnitude >= target);
  return factor * magnitude;
}

/** origin and length are viewport CSS pixels; returned values are document pixels. */
export function rulerTicks({ length, origin, scale, minSpacing = 72 }) {
  const majorStep = rulerInterval(scale, minSpacing);
  if (!majorStep || !Number.isFinite(length) || length <= 0 || !Number.isFinite(origin)) return [];
  const step = majorStep / 5;
  const first = Math.ceil(-origin / (step * scale));
  const last = Math.floor((length - origin) / (step * scale));
  const ticks = [];
  for (let index = first; index <= last; index++) {
    const value = Number((index * step).toPrecision(12));
    ticks.push({ value: Object.is(value, -0) ? 0 : value, position: origin + value * scale, major: index % 5 === 0 });
  }
  return ticks;
}

/** Only the backing store follows DPR; geometry remains in viewport CSS pixels. */
export function rulerBitmapSize(width, height, dpr = 1) {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), ratio };
}

function paintRuler(canvas, { length, origin, scale, extent, vertical, dpr }) {
  const width = vertical ? THICKNESS : length;
  const height = vertical ? length : THICKNESS;
  const bitmap = rulerBitmapSize(width, height, dpr);
  if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
  if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(bitmap.ratio, 0, 0, bitmap.ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (vertical) {
    ctx.translate(THICKNESS, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.fillStyle = "#edf0f4";
  ctx.fillRect(0, 0, length, THICKNESS);
  ctx.fillStyle = "#fff";
  ctx.fillRect(
    Math.max(0, origin),
    0,
    Math.max(0, Math.min(length, origin + extent * scale) - Math.max(0, origin)),
    THICKNESS,
  );
  ctx.strokeStyle = "#b8c1cd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, THICKNESS - 0.5);
  ctx.lineTo(length, THICKNESS - 0.5);
  ctx.stroke();
  ctx.font = "10px system-ui, sans-serif";
  ctx.textBaseline = "top";
  for (const tick of rulerTicks({ length, origin, scale })) {
    const position = Math.round(tick.position * bitmap.ratio) / bitmap.ratio;
    ctx.strokeStyle = tick.value === 0 ? "#65778e" : "#a5b0bf";
    ctx.beginPath();
    ctx.moveTo(position, THICKNESS - (tick.major ? 8 : 4));
    ctx.lineTo(position, THICKNESS);
    ctx.stroke();
    if (tick.major) {
      ctx.fillStyle = "#46556a";
      ctx.fillText(String(tick.value), position + 3, 2);
    }
  }
}

/**
 * update({ width, height, scale, board? }) uses document pixels. When a board is
 * available its measured viewport bounds provide the exact zero and zoom.
 * One frame batches scrolling, resize and editor updates; destroy releases all.
 */
export function createRulers(stage) {
  const doc = stage.ownerDocument;
  const win = doc.defaultView;
  const overlay = doc.createElement("div");
  overlay.className = "flyer-rulers";
  overlay.setAttribute("aria-hidden", "true");
  const horizontal = doc.createElement("canvas");
  horizontal.className = "flyer-ruler-horizontal";
  const vertical = doc.createElement("canvas");
  vertical.className = "flyer-ruler-vertical";
  const corner = doc.createElement("span");
  corner.className = "flyer-ruler-unit";
  corner.textContent = "px";
  function startGuide(event, axis) {
    if (event.button !== 0) return;
    const bounds = stage.getBoundingClientRect();
    if (event.clientX < bounds.left + THICKNESS && event.clientY < bounds.top + THICKNESS) return;
    event.preventDefault();
    event.stopPropagation();
    stage.dispatchEvent(
      new win.CustomEvent("flyer-guide-create", {
        detail: {
          axis,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
          button: event.button,
        },
      }),
    );
  }
  horizontal.title = "Arraste para criar uma guia horizontal";
  vertical.title = "Arraste para criar uma guia vertical";
  horizontal.onpointerdown = (event) => startGuide(event, "y");
  vertical.onpointerdown = (event) => startGuide(event, "x");
  overlay.append(horizontal, vertical, corner);
  stage.append(overlay);
  let state = { width: 0, height: 0, scale: 1 },
    frame = null,
    disposed = false,
    observedBoard;
  const observer = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  observer?.observe(stage);

  function draw() {
    frame = null;
    if (disposed || !stage.isConnected) return;
    const board = state.board || stage.querySelector(".flyer-artboard");
    if (observedBoard !== board) {
      if (observedBoard) observer?.unobserve(observedBoard);
      if (board) observer?.observe(board);
      observedBoard = board;
    }
    const viewport = stage.getBoundingClientRect();
    const bounds = board?.getBoundingClientRect();
    const width = stage.clientWidth,
      height = stage.clientHeight;
    const originX = bounds ? bounds.left - viewport.left - stage.clientLeft : 24 - stage.scrollLeft;
    const originY = bounds ? bounds.top - viewport.top - stage.clientTop : 24 - stage.scrollTop;
    const scaleX = bounds && state.width > 0 ? bounds.width / state.width : state.scale;
    const scaleY = bounds && state.height > 0 ? bounds.height / state.height : state.scale;
    // Absolute children otherwise move with the scrollable artwork.
    overlay.style.transform = `translate(${stage.scrollLeft}px, ${stage.scrollTop}px)`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    const dpr = win.devicePixelRatio || 1;
    paintRuler(horizontal, { length: width, origin: originX, scale: scaleX, extent: state.width, dpr });
    paintRuler(vertical, { length: height, origin: originY, scale: scaleY, extent: state.height, vertical: true, dpr });
  }
  function schedule() {
    if (!disposed && frame === null) frame = win.requestAnimationFrame(draw);
  }
  stage.addEventListener("scroll", schedule, { passive: true });
  win.addEventListener("resize", schedule, { passive: true });
  schedule();
  return {
    update(next) {
      state = { ...state, ...next };
      schedule();
    },
    destroy() {
      disposed = true;
      if (frame !== null) win.cancelAnimationFrame(frame);
      observer?.disconnect();
      stage.removeEventListener("scroll", schedule);
      win.removeEventListener("resize", schedule);
      overlay.remove();
    },
  };
}
