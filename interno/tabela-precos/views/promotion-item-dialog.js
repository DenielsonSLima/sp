import { escapeHtml as esc } from "../../../shared/ui.js";
import { attachCurrencyInput } from "../../../shared/components/currency-input/index.js";
import { templates, dimensionLabel } from "../../cadastros/modelos-cartaz/model.js";

export function openPromotionItemDialog(root, { item, onSave, onSaved, isCurrent, trigger }) {
  const dialog = document.createElement("dialog");
  dialog.className = "tp-confirm tp-module tp-promotion-dialog";
  dialog.setAttribute("aria-labelledby", "tp-item-title");
  dialog.innerHTML = `<form><h2 id="tp-item-title">Configurar cartaz</h2><p>${esc(item.name || item.productSnapshot?.name || "Produto")}</p>
    <div class="tp-promotion-dates"><label>Preço de venda (R$)<input name="priceRaw" inputmode="decimal" value="${esc(item.priceRaw || "")}" placeholder="0,00"></label>
    <label>Quantidade de cartazes<input name="quantity" type="number" min="1" max="200" step="1" required value="${esc(item.quantity || 1)}"></label></div>
    <label>Modelo de impressão<select name="templateId"><option value="">Selecionar depois</option>${templates.map((model) => `<option value="${esc(model.id)}" ${item.templateId === model.id ? "selected" : ""}>${esc(model.name)} · ${esc(dimensionLabel(model))}</option>`).join("")}</select></label>
    <label>Formato<select name="printLayout"><option value="individual" ${item.printLayout !== "two-a4" ? "selected" : ""}>Folha individual do modelo</option><option value="two-a4" ${item.printLayout === "two-a4" ? "selected" : ""}>2 por A4 paisagem</option></select></label>
    <p class="tp-help">Você pode salvar os dados incompletos e terminar antes de enviar para impressão.</p><p class="tp-status" role="status" aria-live="polite"></p>
    <div class="tp-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="submit">Salvar produto</button></div></form>`;
  root.append(dialog);
  const form = dialog.querySelector("form");
  let busy = false;
  attachCurrencyInput(form.elements.priceRaw);
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity() || !isCurrent()) return;
    busy = true;
    form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      const input = Object.fromEntries(new FormData(form));
      form.querySelectorAll("input, select").forEach((field) => { field.disabled = true; });
      const saved = await onSave(input);
      if (!isCurrent()) return dialog.close();
      dialog.close(); onSaved(saved);
    } catch (error) { if (dialog.isConnected && isCurrent()) dialog.querySelector(".tp-status").textContent = error.message; }
    finally {
      busy = false;
      if (dialog.isConnected) form.querySelectorAll("button, input, select").forEach((field) => { field.disabled = false; });
    }
  };
  dialog.showModal(); form.elements.priceRaw.focus();
}
