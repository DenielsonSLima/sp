import { watchUnits } from "./realtime.js";
import { bindFormDialog } from "../../../shared/form-dialog.js";
import { resourceError } from "../remote.js";
import { heading, escapeHtml } from "../../../shared/ui.js";
import { icon } from "../../../shared/icons.js";
import { filterRecords } from "../../../shared/filters.js";
import { units, saveUnit, loadUnits } from "./state.js";
export async function render(root) {
  try {
    await loadUnits();
  } catch (error) {
    resourceError(root, error);
    return;
  }
  root.innerHTML = `<link rel="stylesheet" href="./interno/cadastros/catalog.css"><link rel="stylesheet" href="./interno/cadastros/unidades/styles.css"><div class="page-heading-actions">${heading("CADASTROS", "Unidades de medida")}<button class="button primary new-unit">${icon("plus")} Nova unidade</button></div><form class="card catalog-form" hidden><h3>Nova unidade</h3><p class="catalog-helper">As unidades não fazem conversões automáticas de peso, volume ou embalagem.</p><input type="hidden" name="id"><input type="hidden" name="_version"><div class="catalog-fields"><label>Nome<input name="name" required maxlength="60" placeholder="Ex.: Gramas"></label><label>Sigla<input name="symbol" required maxlength="8" placeholder="Ex.: G"></label></div><div class="catalog-form-actions"><button class="button primary" type="submit">Salvar</button><button class="button secondary cancel-unit" type="button">Cancelar</button></div></form><label class="unit-search">Buscar unidade<input type="search" placeholder="Nome ou sigla..."></label><p class="catalog-count" aria-live="polite"></p><section class="catalog-grid" aria-label="Unidades encontradas"></section><p class="catalog-status" role="status"></p>`;
  const form = root.querySelector("form");
  const modal = bindFormDialog(form, {
    host: root,
    resource: "units",
    cancelSelector: ".cancel-unit",
    errorSource: root.querySelector(".catalog-status"),
  });
  const open = (unit) => {
    form.reset();
    form.elements.id.value = unit?.id || "";
    form.elements._version.value = unit?._version ?? "";
    form.elements.name.value = unit?.name || "";
    form.elements.symbol.value = unit?.symbol || "";
    form.querySelector("h3").textContent = unit ? "Editar unidade" : "Nova unidade";
    modal.open();
    form.elements.name.focus();
  };
  let renderedSignature = "";
  const list = () => {
    const signature = JSON.stringify([
      units,
      root.querySelector("[type=search]")?.value,
      root.querySelector(".category-filter")?.value,
    ]);
    if (signature === renderedSignature) return;
    renderedSignature = signature;
    const rows = filterRecords(units, {
      query: root.querySelector("[type=search]").value,
      searchKeys: ["name", "symbol"],
    });
    root.querySelector(".catalog-count").textContent = `${rows.length} unidade(s)`;
    root.querySelector(".catalog-grid").innerHTML = rows.length
      ? rows
          .map(
            (u) =>
              `<article class="card catalog-card"><div class="catalog-card-body"><span class="unit-symbol">${escapeHtml(u.symbol)}</span><h3>${escapeHtml(u.name)}</h3><p>Disponível no cadastro de produtos</p><div class="catalog-card-actions"><button type="button" class="button secondary edit-unit" data-id="${u.id}" aria-label="Editar unidade ${escapeHtml(u.name)}">Editar</button></div></div></article>`,
          )
          .join("")
      : '<div class="card catalog-empty"><h3>Nenhuma unidade encontrada.</h3><p>Tente outro nome ou sigla.</p></div>';
    root
      .querySelectorAll(".edit-unit")
      .forEach((b) => (b.onclick = () => open(units.find((u) => u.id === b.dataset.id))));
  };
  root.querySelector(".new-unit").onclick = () => open();
  root.querySelector(".cancel-unit").onclick = () => {
    modal.close();
    form.reset();
    root.querySelector(".new-unit").focus();
  };
  root.querySelector("[type=search]").oninput = list;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    try {
      await saveUnit({
        ...Object.fromEntries(new FormData(form)),
        _version: form.elements._version.value || undefined,
      });
      form.reset();
      modal.close();
      list();
      root.querySelector(".catalog-status").textContent =
        "Unidade atualizada. Ela já está disponível ao abrir Produtos.";
      root.querySelector(".new-unit").focus();
    } catch (error) {
      root.querySelector(".catalog-status").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  list();
  watchUnits(root, list);
}
