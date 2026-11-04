import { escapeHtml as esc } from "../../../shared/ui.js";

export function openPromotionDialog(root, {
  entry = null, onSave, onSaved = () => {}, isCurrent = () => true, trigger = null,
} = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = "tp-confirm tp-module tp-promotion-dialog";
  dialog.setAttribute("aria-labelledby", "tp-promotion-title");
  dialog.innerHTML = `<form class="tp-promotion-form"><h2 id="tp-promotion-title">${entry ? "Editar promoção" : "Nova promoção"}</h2>
    <p>Defina o nome e o período. Depois, escolha todos os produtos que farão parte da tabela.</p>
    <label>Nome da promoção<input name="name" required maxlength="120" value="${esc(entry?.name || "")}" placeholder="Ex.: Ofertas da semana"></label>
    <div class="tp-promotion-dates"><label>Data inicial<input name="start" type="date" required value="${esc(entry?.start || "")}"></label>
    <label>Data final<input name="end" type="date" required value="${esc(entry?.end || "")}"></label></div>
    <label>Observação <span class="tp-optional">Opcional</span><textarea name="notes" maxlength="4000" rows="3" placeholder="Informações sobre esta promoção">${esc(entry?.notes || "")}</textarea></label>
    <p class="tp-status" role="status" aria-live="polite"></p>
    <div class="tp-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button>
    <button class="button primary tp-promotion-save" type="submit">${entry ? "Salvar alterações" : "Salvar e adicionar produtos"}</button></div></form>`;
  root.append(dialog);
  const form = dialog.querySelector("form"), button = dialog.querySelector(".tp-promotion-save");
  let busy = false;
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); });
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity() || !isCurrent()) return;
    busy = true;
    button.disabled = true;
    dialog.querySelector("[data-cancel]").disabled = true;
    dialog.querySelector(".tp-status").textContent = "Salvando promoção…";
    try {
      const input = Object.fromEntries(new FormData(form));
      form.querySelectorAll("input, textarea").forEach((field) => { field.disabled = true; });
      const saved = await onSave(input);
      if (!isCurrent()) return dialog.close();
      dialog.close();
      onSaved(saved);
    } catch (error) {
      if (dialog.isConnected && isCurrent()) dialog.querySelector(".tp-status").textContent = error.message;
    } finally {
      busy = false;
      if (dialog.isConnected) {
        button.disabled = false;
        dialog.querySelector("[data-cancel]").disabled = false;
        form.querySelectorAll("input, textarea").forEach((field) => { field.disabled = false; });
      }
    }
  };
  dialog.showModal();
  form.elements.name.focus();
  return dialog;
}
