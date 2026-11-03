import { constrainElement, validateElement } from "./model.js";
const finitePositive = (value, label) => {
  if (!Number.isFinite(value) || value <= 0) throw Error(`${label} inválido.`);
  return value;
};
const niceStep = (value) => {
  const power = 10 ** Math.floor(Math.log10(value)),
    unit = value / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
};

/** Ruler coordinates use the entire physical sheet, including its 5 mm margins. */
export function rulerTicks(lengthMm, pixels) {
  finitePositive(lengthMm, "Medida");
  finitePositive(pixels, "Escala");
  const majorStep = niceStep(Math.max(0.1, (lengthMm * 44) / pixels, lengthMm / 80));
  const minorStep = niceStep(Math.max(0.1, majorStep / 5, lengthMm / 500)),
    ticks = [];
  const push = (value) => {
    const mm = Number(value.toFixed(6)),
      edge = mm === 0 ? "start" : Math.abs(mm - lengthMm) < 0.000001 ? "end" : "",
      major = !!edge || Math.abs(mm / majorStep - Math.round(mm / majorStep)) < 0.000001;
    const label = major && (edge || ((lengthMm - mm) / lengthMm) * pixels >= 28);
    ticks.push({ mm, position: mm / lengthMm, major, label, edge });
  };
  for (let i = 0; i <= Math.floor(lengthMm / minorStep + 0.000001); i++) push(Math.min(lengthMm, i * minorStep));
  if (Math.abs(ticks.at(-1).mm - lengthMm) > 0.000001) push(lengthMm);
  return { majorStep, minorStep, ticks };
}

export function centerElement(element, axis) {
  if (!["horizontal", "vertical"].includes(axis)) throw Error("Alinhamento inválido.");
  const current = validateElement(element);
  if (current.hidden) return current;
  return constrainElement(current, axis === "horizontal" ? { x: (1 - current.w) / 2 } : { y: (1 - current.h) / 2 });
}

/** A fixed CSS-pixel tolerance feels the same at every sheet size or zoom. */
export function snapElementToCenter(element, { widthPx, heightPx }, thresholdPx = 6) {
  finitePositive(widthPx, "Largura da prévia");
  finitePositive(heightPx, "Altura da prévia");
  if (!Number.isFinite(thresholdPx) || thresholdPx < 0) throw Error("Tolerância inválida.");
  let current = constrainElement(element, {});
  const guides = { vertical: false, horizontal: false };
  if (current.hidden) return { element: current, guides };
  if (Math.abs(current.x + current.w / 2 - 0.5) * widthPx <= thresholdPx) {
    current = centerElement(current, "horizontal");
    guides.vertical = true;
  }
  if (Math.abs(current.y + current.h / 2 - 0.5) * heightPx <= thresholdPx) {
    current = centerElement(current, "vertical");
    guides.horizontal = true;
  }
  return { element: current, guides };
}
