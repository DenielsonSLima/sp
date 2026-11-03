import { escapeHtml as esc } from "../../../shared/ui.js";
import { icon } from "../../../shared/icons.js";
import { units, unitLabel } from "../unidades/queries.js";
import { productCategories, productSubcategories } from "../categorias/queries.js";
import { isPhotoSource } from "./photo.js";
export const categoryNames = () => productCategories.map((row) => row.name);
export const options = (values, selected) =>
  values
    .map((v) => `<option value="${esc(v.value)}" ${(Array.isArray(selected) ? selected.includes(v.value) : v.value === selected) ? "selected" : ""}>${esc(v.label)}</option>`)
    .join("");
export const fields = (product) =>
  `<div class="catalog-fields"><label>Nome do produto<input name="name" required maxlength="100" value="${esc(product.name || "")}" placeholder="Ex.: Tomate"></label><label>Código do produto<input name="code" type="text" maxlength="40" value="${esc(product.code || "")}" placeholder="Ex.: 001-A" autocomplete="off"><span class="catalog-helper">Opcional. Até 40 caracteres.</span></label><label>Categoria<select name="category" required><option value="">Selecione uma categoria</option>${options(
    categoryNames().map((c) => ({ value: c, label: c })),
    product.category || "",
  )}</select></label><label>Unidade de medida<select name="unit" required><option value="">Selecione uma unidade</option>${options([...(!units.some((u) => u.id === product.unit) && product.unit ? [{ value: product.unit, label: product.unitLabel || product.unit }] : []), ...units.map((u) => ({ value: u.id, label: unitLabel(u.id) }))], product.unit || "")}</select></label><label>Subcategoria<select name="subcategoryId"><option value="">Sem subcategoria</option>${options(
    productSubcategories
      .filter((row) => productCategories.find((parent) => parent.id === row.parentId)?.name === product.category)
      .map((row) => ({ value: row.id, label: row.name })),
    product.subcategoryId || "",
  )}</select></label><a class="unit-link" href="#cadastros/unidades">Gerenciar unidades →</a><a class="unit-link" href="#cadastros/categorias">Gerenciar categorias →</a></div>`;
export const photoMarkup = (photo, name) =>
  photo && isPhotoSource(photo)
    ? `<img src="${esc(photo)}" alt="Foto de ${esc(name)}" loading="lazy">`
    : `<span>${icon("cadastros")}<small>Sem foto</small></span>`;
