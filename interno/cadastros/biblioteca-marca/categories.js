import { bindFormDialog } from "../../../shared/form-dialog.js";
import { escapeHtml } from "../../../shared/ui.js";
import { UNCATEGORIZED } from "./state.js";
import { addCategory, renameCategory, removeCategory } from "./storage.js";
export const categoryOptions = (names, selected = "") =>
  names
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}"${name === selected ? " selected" : ""}>${escapeHtml(name)}</option>`,
    )
    .join("");
export function mountCategories(root, { getCategories, getAssets, onChange }) {
  root.innerHTML = `
    <button type="button" class="button secondary brand-manage-categories" aria-haspopup="dialog">Categoria</button>
    <dialog class="form-dialog brand-categories-modal" aria-labelledby="brand-categories-title">
      <header class="form-dialog-heading">
        <h2 id="brand-categories-title">Categorias da biblioteca</h2>
        <button type="button" class="form-dialog-close brand-close-categories" aria-label="Fechar categorias">×</button>
      </header>
      <div class="brand-categories">
        <p>Organize os elementos da biblioteca do seu jeito.</p>
        <form class="brand-add-category">
          <label>Nova categoria<input name="name" maxlength="80" required placeholder="Ex.: Datas comemorativas"></label>
          <button class="button primary" type="submit">Criar categoria</button>
        </form>
        <p class="brand-category-status" role="status" aria-live="polite"></p>
        <ul class="brand-category-list"></ul>
      </div>
    </dialog>
    <dialog class="brand-category-dialog" aria-labelledby="category-dialog-title">
      <form>
        <h2 id="category-dialog-title"></h2>
        <p class="brand-category-description"></p>
        <label class="brand-rename-field">Nome da categoria<input name="name" maxlength="80" required></label>
        <label class="brand-reassign-field">Mover elementos para<select name="target"></select></label>
        <p class="brand-category-dialog-status" role="status" aria-live="polite"></p>
        <div class="brand-category-actions">
          <button class="button primary" type="submit">Salvar</button>
          <button class="button secondary" type="button">Cancelar</button>
        </div>
      </form>
    </dialog>`;
  const q = (s) => root.querySelector(s),
    managerDialog = q(".brand-categories-modal"),
    trigger = q(".brand-manage-categories"),
    dialog = q(".brand-category-dialog"),
    form = dialog.querySelector("form");
  trigger.onclick = () => managerDialog.showModal();
  q(".brand-close-categories").onclick = () => managerDialog.close();
  managerDialog.addEventListener("close", () => {
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  });
  let source, mode;
  const say = (message) => (q(".brand-category-status").textContent = message);
  function open(name, action) {
    source = name;
    mode = action;
    const removing = mode === "remove";
    q("#category-dialog-title").textContent = removing ? "Remover categoria?" : "Renomear categoria";
    q(".brand-category-description").textContent = removing
      ? `“${name}” contém ${getAssets().filter((a) => a.category === name).length} elemento(s). Todos serão movidos para a categoria escolhida. Nenhum PNG será excluído; as artes salvas continuam intactas.`
      : `Novo nome para “${name}”. Os elementos acompanharão a alteração.`;
    q(".brand-rename-field").hidden = removing;
    q(".brand-reassign-field").hidden = !removing;
    form.elements.name.disabled = removing;
    form.elements.target.disabled = !removing;
    form.elements.name.value = name;
    form.elements.target.innerHTML = categoryOptions(
      getCategories().filter((c) => c !== name),
      UNCATEGORIZED,
    );
    q(".brand-category-dialog-status").textContent = "";
    form.querySelector("[type=submit]").textContent = removing ? "Remover e mover elementos" : "Salvar nome";
    dialog.showModal();
    if (!removing) form.elements.name.focus();
    else form.querySelector("[type=button]").focus();
  }
  function draw() {
    q(".brand-category-list").innerHTML = getCategories()
      .map(
        (name) =>
          `<li><span>${escapeHtml(name)} <small>${getAssets().filter((a) => a.category === name).length} elemento(s)</small></span>${name === UNCATEGORIZED ? '<span class="brand-category-fixed">Padrão</span>' : `<div><button type="button" class="button secondary" data-action="rename" data-name="${escapeHtml(name)}" aria-label="Renomear categoria ${escapeHtml(name)}">Renomear</button><button type="button" class="button secondary" data-action="remove" data-name="${escapeHtml(name)}" aria-label="Remover categoria ${escapeHtml(name)}">Remover</button></div>`}</li>`,
      )
      .join("");
    root
      .querySelectorAll("[data-action]")
      .forEach((button) => (button.onclick = () => open(button.dataset.name, button.dataset.action)));
  }
  const createForm = q(".brand-add-category"),
    createButton = document.createElement("button");
  createButton.type = "button";
  createButton.className = "button primary";
  createButton.textContent = "Nova categoria";
  createForm.before(createButton);
  const createModal = bindFormDialog(createForm, {
    host: root,
    title: "Nova categoria da biblioteca",
    resource: "brand_categories",
    errorSource: q(".brand-category-status"),
  });
  createButton.onclick = () => createModal.open();
  q(".brand-add-category").onsubmit = async (event) => {
    event.preventDefault();
    const f = event.currentTarget,
      button = f.querySelector("button");
    if (button.disabled) return;
    button.disabled = true;
    try {
      await addCategory(f.elements.name.value);
      f.reset();
      createModal.close();
      await onChange();
      say("Categoria criada.");
    } catch (error) {
      say(error.message);
    } finally {
      button.disabled = false;
    }
  };
  form.querySelector("[type=button]").onclick = () => dialog.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (mode === "remove") await removeCategory(source, form.elements.target.value);
      else await renameCategory(source, form.elements.name.value);
      dialog.close();
      await onChange();
      say(mode === "remove" ? "Categoria removida e elementos reclassificados." : "Categoria renomeada.");
    } catch (error) {
      q(".brand-category-dialog-status").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  return {
    draw,
    dispose() {
      createModal.dispose();
      if (dialog.open) dialog.close();
      if (managerDialog.open) managerDialog.close();
    },
  };
}
