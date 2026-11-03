import { escapeHtml as esc } from "../../../shared/ui.js";
import { normalizeTemplate, validateElement, validityFrame } from "./definition.js";
import { templates } from "./queries.js";

export const dimensionLabel = (t) =>
  `${String(t.widthMm).replace(".", ",")} × ${String(t.heightMm).replace(".", ",")} mm · retrato`;
export function offerTemplate(offer) {
  const t = offer.templateSnapshot || templates.find((t) => t.id === offer.templateId);
  if (!t) throw Error("Modelo inválido.");
  return normalizeTemplate(t);
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const dateLabel = (value) => value.split("-").reverse().join("/");
const percent = (value) => Number((value * 100).toFixed(4));
export function elementStyle(element) {
  const e = validateElement(element);
  return `left:${percent(e.x)}%;top:${percent(e.y)}%;width:${percent(e.w)}%;height:${percent(e.h)}%;--element-size:${e.fontSize};--element-font:${e.fontFamily};--element-letter-spacing:${e.letterSpacing};--element-line-height:${e.lineHeight};--element-justify:${{ left: "flex-start", center: "center", right: "flex-end" }[e.align]};text-align:${e.align}`;
}
export function resolveProductText(offer, template) {
  const name = typeof offer.displayName === "string" && offer.displayName.trim() ? offer.displayName : offer.name;
  if (typeof name !== "string") throw Error("Nome do produto inválido.");
  return (template.productText ?? "{{produto}}").replaceAll("{{produto}}", name);
}
export function posterMarkup(offer, template) {
  const t = template ? normalizeTemplate(template) : offerTemplate(offer);
  if (
    !offer.preview &&
    (!Number.isInteger(offer.cents) ||
      offer.cents < 1 ||
      offer.cents > 999999 ||
      typeof offer.name !== "string" ||
      !["kg", "unid"].includes(offer.unit) ||
      !validDate(offer.start) ||
      !validDate(offer.end))
  )
    throw Error("Cartaz inválido.");
  const frame = validityFrame(t),
    unitMm = (t.widthMm - 10) / 100;
  const productText = resolveProductText(offer, t),
    amount = (offer.cents / 100).toFixed(2).split("."),
    nameScale = productText.length > 65 ? 0.6 : productText.length > 35 ? 0.78 : 1;
  const attrs = (key) => `data-poster-element="${key}" style="${esc(elementStyle(t.layout[key]))}"`;
  const visible = (key, markup) => (t.layout[key].hidden ? "" : markup);
  return `<article class="price-poster poster-${esc(t.id)}" style="--poster-ink:${esc(t.color)};--poster-paper:${esc(t.background)};--poster-font:${esc(t.font)};--poster-scale:${t.scale};--validity-border-width:${frame.widthMm / unitMm};--validity-padding:${frame.paddingMm / unitMm};--name-scale:${nameScale};--amount-scale:${offer.cents >= 100000 ? 0.7 : offer.cents >= 10000 ? 0.85 : 1}">${visible("headline", `<div class="poster-element poster-kicker" ${attrs("headline")}>${esc(t.headline)}</div>`)}${visible("product", `<h2 class="poster-element poster-product" ${attrs("product")}>${esc(productText)}</h2>`)}${visible("price", `<div class="poster-element poster-price-area" ${attrs("price")}><div class="poster-price" role="img" aria-label="${esc(`R$ ${amount.join(",")} por ${offer.unit}`)}"><span class="poster-currency" aria-hidden="true">R$</span><strong class="poster-integer" aria-hidden="true">${amount[0]}</strong><div class="poster-price-side" aria-hidden="true"><span class="poster-cents">,${amount[1]}</span><span class="poster-unit">${offer.unit === "kg" ? "KG" : "UN"}</span></div></div></div>`)}${visible("validity", `<p class="poster-element poster-validity" ${attrs("validity")}>${offer.preview ? "Período da oferta" : `Válido de ${esc(dateLabel(offer.start))} até ${esc(dateLabel(offer.end))}`}</p>`)}</article>`;
}
export const paperStyle = (t) =>
  `--paper-ratio:${t.widthMm}/${t.heightMm};--inset-x:${(500 / t.widthMm).toFixed(5)}%;--inset-y:${(500 / t.heightMm).toFixed(5)}%`;
export function miniMarkup(template) {
  const t = normalizeTemplate(template);
  return `<div class="poster-mini-paper" style="${paperStyle(t)};--mini-width:${((226 * t.widthMm) / t.heightMm).toFixed(2)}px"><div class="poster-mini-content">${posterMarkup(sampleOffer(t.id), t)}</div></div>`;
}
export function sheetsMarkup(offers) {
  const rules = [],
    pages = offers.map((offer, i) => {
      const t = offerTemplate(offer),
        page = `poster-page-${i}`;
      rules.push(`@page ${page}{size:${t.widthMm}mm ${t.heightMm}mm;margin:0;}`);
      return `<section class="poster-sheet sheet-${esc(t.id)}" style="page:${page};--paper-width:${t.widthMm}mm;--paper-height:${t.heightMm}mm;--poster-unit:${((t.widthMm - 10) / 100).toFixed(4)}mm" aria-label="${esc(`${t.name} · ${dimensionLabel(t)} · um cartaz por folha`)}">${posterMarkup(offer, t)}</section>`;
    });
  return `<style class="poster-page-rules">@media print{${rules.join("")}}</style>${pages.join("")}`;
}
// Presentation placeholders only; this object is never stored as a product or offer.
export const sampleOffer = (id) => ({
  name: "Nome do produto",
  cents: 0,
  unit: "unid",
  start: "",
  end: "",
  templateId: id,
  preview: true,
});
