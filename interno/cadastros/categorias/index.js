import { watchProductCategories } from "./realtime.js";
import { bindUppercaseInput } from "../../../shared/components/uppercase-input.js";
import { bindFormDialog } from "../../../shared/form-dialog.js";
import { heading, escapeHtml as esc } from "../../../shared/ui.js";
import { resourceError } from "../remote.js";
import { loadProductCategories, productCategories, productSubcategories, saveProductCategory } from "./state.js";
const fold = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
const optionRows = (rows, value) =>
  rows
    .map((row) => `<option value="${esc(row.id)}" ${row.id === value ? "selected" : ""}>${esc(row.name)}</option>`)
    .join("");
export async function render(root) {
  try {
    await loadProductCategories();
  } catch (error) {
    resourceError(root, error);
    return;
  }
  root.innerHTML = `<div class="page-heading-actions">${heading("CADASTROS", "Categorias")}<div class="category-create-actions"><button class="button primary" type="button" data-new>Nova categoria</button></div></div><form class="card catalog-form" hidden><h3>Nova categoria</h3><input name="id" type="hidden"><input name="_version" type="hidden"><div class="catalog-fields"><label>Tipo<select name="kind"><option value="category">Categoria</option><option value="subcategory">Subcategoria</option></select></label><label class="category-parent">Categoria principal<select name="parentId"></select></label><label>Nome<input name="name" maxlength="80" required></label></div><div class="catalog-form-actions"><button class="button primary" type="submit">Salvar</button><button class="button secondary" type="button" data-cancel>Cancelar</button></div></form><section class="card category-filters" aria-label="Filtros de categorias"><label>Buscar<input type="search" class="category-search" maxlength="100" placeholder="Buscar categoria ou subcategoria..."></label><label>Categoria<select class="category-filter"></select></label><label>Subcategoria<select class="subcategory-filter"></select></label><button class="button secondary" type="button" data-clear>Limpar filtros</button></section><p class="catalog-count" aria-live="polite"></p><div class="card category-table-wrap" tabindex="0" aria-label="Categorias e subcategorias cadastradas"></div><p class="catalog-status" role="status" aria-live="polite"></p>`;
  const form = root.querySelector("form"),
    status = root.querySelector("[role=status]"),
    category = root.querySelector(".category-filter"),
    subcategory = root.querySelector(".subcategory-filter");
  const modal = bindFormDialog(form, {
    host: root,
    resource: "product_categories",
    cancelSelector: "[data-cancel]",
    errorSource: status,
  });
  const expanded = new Map();
  bindUppercaseInput(form.elements.name);
  let newSubParent = "";
  const syncKind = () => {
    const isSub = form.elements.kind.value === "subcategory";
    form.querySelector(".category-parent").hidden = !isSub;
    form.elements.parentId.disabled = !isSub || Boolean(form.elements.id.value) || Boolean(newSubParent);
    form.elements.parentId.required = isSub;
  };
  const open = (row, isSub = false, parentId = "") => {
    form.reset();
    newSubParent = parentId;
    form.elements.id.value = row?.id || "";
    form.elements._version.value = row?._version ?? "";
    form.elements.name.value = row?.name || "";
    form.elements.kind.value = row?.parentId || isSub ? "subcategory" : "category";
    form.elements.kind.disabled = Boolean(row) || Boolean(parentId);
    form.elements.parentId.innerHTML =
      '<option value="">Selecione uma categoria</option>' +
      optionRows(productCategories, row?.parentId || parentId || category.value);
    form.elements.parentId.value = row?.parentId || parentId || category.value;
    form.querySelector("h3").textContent =
      `${row ? "Editar" : "Nova"} ${form.elements.kind.value === "subcategory" ? "subcategoria" : "categoria"}`;
    syncKind();
    modal.open();
    form.elements.name.focus();
  };
  const syncFilters = () => {
    const selected = category.value,
      subSelected = subcategory.value;
    category.innerHTML = '<option value="">Todas as categorias</option>' + optionRows(productCategories, selected);
    subcategory.innerHTML =
      '<option value="">Todas as subcategorias</option>' +
      optionRows(
        productSubcategories.filter((row) => !category.value || row.parentId === category.value),
        subSelected,
      );
  };
  const draw = () => {
    syncFilters();
    const query = fold(root.querySelector(".category-search").value);
    const groups = productCategories
      .filter((parent) => !category.value || parent.id === category.value)
      .map((parent) => {
        const children = productSubcategories
          .filter((row) => row.parentId === parent.id)
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        const matches = children.filter(
          (row) =>
            (!subcategory.value || row.id === subcategory.value) &&
            (!query || fold(parent.name + " " + row.name).includes(query)),
        );
        return { parent, children, matches };
      })
      .filter(({ parent, matches }) =>
        subcategory.value ? matches.length : !query || fold(parent.name).includes(query) || matches.length,
      )
      .sort((a, b) => a.parent.name.localeCompare(b.parent.name, "pt-BR"));
    root.querySelector(".catalog-count").textContent =
      `${groups.length} categoria(s) · ${productSubcategories.length} subcategoria(s) cadastradas`;
    root.querySelector(".category-table-wrap").innerHTML =
      `<table class="category-table"><caption class="visually-hidden">Categorias e subcategorias</caption><thead><tr><th scope="col">Categoria / Subcategoria</th><th scope="col">Ações</th></tr></thead>${
        groups.length
          ? groups
              .map(({ parent, children, matches }, index) => {
                const isExpanded = expanded.get(parent.id) ?? Boolean(query || subcategory.value),
                  childrenId = `category-children-${index}`;
                return `<tbody><tr class="category-main-row"><th scope="row"><div class="category-heading"><button class="category-expand" type="button" data-expand="${esc(parent.id)}" aria-expanded="${isExpanded}" aria-controls="${childrenId}" aria-label="${isExpanded ? "Recolher" : "Expandir"} subcategorias de ${esc(parent.name)}"><span aria-hidden="true">${isExpanded ? "−" : "+"}</span></button><span class="category-name">${esc(parent.name)} <small>${children.length} subcategoria(s)</small></span><button class="button secondary category-add-sub" type="button" data-new-sub="${esc(parent.id)}" aria-label="Cadastrar subcategoria em ${esc(parent.name)}">+ Cadastrar subcategoria</button></div></th><td><button class="button secondary" type="button" data-edit="${esc(parent.id)}" aria-label="Editar categoria ${esc(parent.name)}">Editar</button></td></tr></tbody><tbody id="${childrenId}" ${isExpanded ? "" : "hidden"}>${matches.length ? matches.map((row) => `<tr class="category-child-row"><th scope="row"><span class="category-child-name">${esc(row.name)}</span></th><td><button class="button secondary" type="button" data-edit="${esc(row.id)}" aria-label="Editar subcategoria ${esc(row.name)}">Editar</button></td></tr>`).join("") : `<tr class="category-child-row"><td colspan="2" class="category-empty">${children.length ? "Nenhuma subcategoria corresponde aos filtros." : "Nenhuma subcategoria cadastrada."}</td></tr>`}</tbody>`;
              })
              .join("")
          : '<tbody><tr><td colspan="2">Nenhuma categoria ou subcategoria encontrada.</td></tr></tbody>'
      }</table>`;
    root
      .querySelectorAll("[data-edit]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            open([...productCategories, ...productSubcategories].find((row) => row.id === button.dataset.edit))),
      );
    root.querySelectorAll("[data-new-sub]").forEach(
      (button) =>
        (button.onclick = () => {
          expanded.set(button.dataset.newSub, true);
          open(null, true, button.dataset.newSub);
        }),
    );
    root.querySelectorAll("[data-expand]").forEach(
      (button) =>
        (button.onclick = () => {
          const id = button.dataset.expand;
          expanded.set(id, button.getAttribute("aria-expanded") !== "true");
          draw();
          [...root.querySelectorAll("[data-expand]")]
            .find((next) => next.dataset.expand === id)
            ?.focus({ preventScroll: true });
        }),
    );
  };
  root.querySelector("[data-new]").onclick = () => open();
  root.querySelector("[data-cancel]").onclick = () => {
    modal.close();
    form.reset();
  };
  form.elements.kind.onchange = syncKind;
  const filterDraw = () => {
    expanded.clear();
    draw();
  };
  root.querySelector(".category-search").oninput = filterDraw;
  category.onchange = () => {
    subcategory.value = "";
    filterDraw();
  };
  subcategory.onchange = filterDraw;
  root.querySelector("[data-clear]").onclick = () => {
    category.value = "";
    subcategory.value = "";
    root.querySelector(".category-search").value = "";
    filterDraw();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    const input = {
      name: form.elements.name.value,
      parentId: form.elements.kind.value === "subcategory" ? form.elements.parentId.value : null,
    };
    if (form.elements.id.value) {
      input.id = form.elements.id.value;
      input._version = Number(form.elements._version.value);
    }
    try {
      await saveProductCategory(input);
      if (!root.isConnected) return;
      form.reset();
      modal.close();
      draw();
      status.textContent = "Categoria salva no banco.";
    } catch (error) {
      if (root.isConnected) status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  draw();
  watchProductCategories(root, draw);
}
