import { FONTS } from './fonts.js';
export { FONTS } from './fonts.js';

export const SIZES = Object.freeze({
  small: { label: "Pequeno", paper: "A6", widthMm: 105, heightMm: 148, count: 1 },
  medium: { label: "Médio", paper: "A5", widthMm: 148, heightMm: 210, count: 1 },
  large: { label: "Grande", paper: "A4", widthMm: 210, heightMm: 297, count: 1 },
});
export const ELEMENTS = Object.freeze({
  headline: "Chamada",
  product: "Produto",
  price: "Preço",
  validity: "Validade",
});
export const VALIDITY_FRAME = Object.freeze({ widthMm: 0.35, paddingMm: 1 });
export function validityFrame(template) {
  const box = template.layout.validity,
    width = (template.widthMm - 10) * box.w,
    height = (template.heightMm - 10) * box.h;
  return {
    widthMm: VALIDITY_FRAME.widthMm,
    paddingMm: Math.max(
      0,
      Math.min(
        VALIDITY_FRAME.paddingMm,
        (width - 2 * VALIDITY_FRAME.widthMm) / 4,
        (height - 2 * VALIDITY_FRAME.widthMm) / 4,
      ),
    ),
  };
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.hasOwn(object, key);
const number = (value, label) => {
  if (value === "" || value === null || typeof value === "boolean" || !Number.isFinite(Number(value)))
    throw Error(`${label} inválido.`);
  return Number(value);
};
const validId = (id) =>
  typeof id === "string" &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(id) &&
  !["__proto__", "constructor", "prototype", "toString"].includes(id);
export const TEXT_DEFAULTS = Object.freeze({
  headline: { letterSpacing: 0.1, lineHeight: 1.1 },
  product: { letterSpacing: 0, lineHeight: 1.08 },
  price: { letterSpacing: 0, lineHeight: 1 },
  validity: { letterSpacing: 0, lineHeight: 1.4 },
});
export function defaultLayout(font = "Arial") {
  const layout = {
    headline: { x: 0.05, y: 0.02, w: 0.9, h: 0.1, fontSize: 4, fontFamily: font, align: "center" },
    product: { x: 0.04, y: 0.17, w: 0.92, h: 0.25, fontSize: 8.5, fontFamily: font, align: "center" },
    price: { x: 0.04, y: 0.43, w: 0.92, h: 0.36, fontSize: 29, fontFamily: font, align: "center" },
    validity: { x: 0.04, y: 0.86, w: 0.92, h: 0.1, fontSize: 2.5, fontFamily: font, align: "center" },
  };
  return Object.fromEntries(
    Object.entries(layout).map(([key, value]) => [key, { ...value, hidden: false, ...TEXT_DEFAULTS[key] }]),
  );
}
export function validateElement(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Elemento inválido.");
  const item = {};
  for (const key of ["x", "y", "w", "h", "fontSize"])
    item[key] = number(input[key], key === "fontSize" ? "Tamanho da fonte" : "Posição ou tamanho");
  if (
    item.x < 0 ||
    item.y < 0 ||
    item.w < 0.08 ||
    item.h < 0.035 ||
    item.x + item.w > 1.000001 ||
    item.y + item.h > 1.000001
  )
    throw Error("Mantenha o elemento dentro da folha. Largura mínima: 8%; altura mínima: 3,5%.");
  if (item.fontSize < 1.5 || item.fontSize > 55) throw Error("Use fonte entre 1,5 e 55% da largura útil.");
  if (!FONTS.includes(input.fontFamily) || !["left", "center", "right"].includes(input.align))
    throw Error("Fonte ou alinhamento inválido.");
  const hidden = input.hidden === undefined ? false : input.hidden;
  if (typeof hidden !== "boolean") throw Error("Visibilidade do elemento inválida.");
  const letterSpacing = number(input.letterSpacing === undefined ? 0 : input.letterSpacing, "Espaçamento entre letras"),
    lineHeight = number(input.lineHeight === undefined ? 1 : input.lineHeight, "Espaçamento entre linhas");
  if (letterSpacing < -0.1 || letterSpacing > 0.5) throw Error("Use espaçamento entre letras de -0,1 a 0,5 em.");
  if (lineHeight < 0.7 || lineHeight > 3) throw Error("Use espaçamento entre linhas de 0,7 a 3.");
  return { ...item, fontFamily: input.fontFamily, align: input.align, hidden, letterSpacing, lineHeight };
}
export function constrainElement(input, change) {
  const next = { ...input, ...change };
  for (const key of ["x", "y", "w", "h"]) next[key] = number(next[key], "Posição ou tamanho");
  next.w = Math.max(0.08, Math.min(1, next.w));
  next.h = Math.max(0.035, Math.min(1, next.h));
  next.x = Math.max(0, Math.min(1 - next.w, next.x));
  next.y = Math.max(0, Math.min(1 - next.h, next.y));
  return validateElement(next);
}
export function templateSettings(input) {
  if (!input || typeof input !== "object") throw Error("Modelo inválido.");
  if (!/^#[0-9a-f]{6}$/i.test(input.color) || !/^#[0-9a-f]{6}$/i.test(input.background))
    throw Error("Escolha cores válidas.");
  if (!FONTS.includes(input.font)) throw Error("Fonte inválida.");
  const scale = number(input.scale, "Escala");
  if (scale < 0.8 || scale > 1.15) throw Error("Escala inválida.");
  const dimension = (value) => {
    const text = String(value);
    if (!/^\d+(?:[,.]\d)?$/.test(text)) throw Error("Use medidas em mm com até uma casa decimal.");
    return Number(text.replace(",", "."));
  };
  const widthMm = dimension(input.widthMm),
    heightMm = dimension(input.heightMm);
  if (widthMm < 60 || widthMm > 420 || heightMm < 80 || heightMm > 594)
    throw Error("Use largura entre 60 e 420 mm e altura entre 80 e 594 mm.");
  if (heightMm <= widthMm) throw Error("O cartaz deve ficar em retrato: a altura precisa ser maior que a largura.");
  const source = input.layout === undefined ? defaultLayout(input.font) : input.layout;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw Error("Layout inválido.");
  const layout = {};
  for (const key of Object.keys(ELEMENTS)) {
    if (!own(source, key)) throw Error("O modelo precisa dos quatro elementos.");
    layout[key] = validateElement({ ...TEXT_DEFAULTS[key], ...source[key] });
  }
  return { color: input.color, background: input.background, font: input.font, scale, widthMm, heightMm, layout };
}
function multilineText(value, max, label) {
  if (typeof value !== "string") throw Error(`Texto de ${label} inválido.`);
  const text = value.replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  if (!text.trim() || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
    throw Error(`Informe ${label} com até ${max} caracteres.`);
  return text;
}
export function normalizeTemplate(input) {
  if (!input || !validId(input.id)) throw Error("Identificador do modelo inválido.");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 60 || /[\u0000-\u001f]/.test(name)) throw Error("Informe um nome de até 60 caracteres.");
  const headline = multilineText(input.headline === undefined ? "OFERTA" : input.headline, 120, "chamada");
  const productText = multilineText(
    input.productText === undefined ? "{{produto}}" : input.productText,
    300,
    "texto do produto",
  );
  if (!productText.includes("{{produto}}"))
    throw Error("Mantenha {{produto}} no texto para usar o nome real de cada produto.");
  return { id: input.id, name, headline, productText, ...templateSettings(input) };
}
export function parseTemplates(serialized) {
  if (typeof serialized !== "string" || serialized.length > 300000) throw Error("Arquivo de modelos inválido.");
  const data = JSON.parse(serialized);
  if (!data || data.version !== 1 || !Array.isArray(data.templates) || data.templates.length > 100)
    throw Error("Arquivo de modelos inválido.");
  const result = data.templates.map(normalizeTemplate);
  if (new Set(result.map((t) => t.id)).size !== result.length) throw Error("Modelos duplicados.");
  return result;
}
export function serializeTemplates(items) {
  if (!Array.isArray(items) || items.length > 100) throw Error("Lista de modelos inválida.");
  const clean = items.map(normalizeTemplate);
  if (new Set(clean.map((t) => t.id)).size !== clean.length) throw Error("Modelos duplicados.");
  return JSON.stringify({ version: 1, templates: clean });
}
