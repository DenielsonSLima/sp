import { escapeHtml as esc } from "../../../shared/ui.js";
import { formatBRLCents } from "../../../shared/components/currency-input/index.js";
import { photoMarkup } from "../../cadastros/produtos/view.js";
import { loadTemplates } from "../../cadastros/modelos-cartaz/model.js";
import { priceTableStore as store } from "../state.js";
import { getDataContext } from "../services.js";
import { watchPriceTables } from "../realtime.js";
import { loadPriceTableDetail } from "../queries.js";
import { openPromotionDialog } from "./promotion-dialog.js";
import { openPromotionProductPicker } from "./promotion-picker.js";
import { openPromotionItemDialog } from "./promotion-item-dialog.js";

const date = (value) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const price = (item) => Number.isSafeInteger(item.cents) ? `R$ ${formatBRLCents(item.cents)}` : "Preço pendente";

export function renderPromotionDetail(root, { entry: initial, chrome, onBack, onDeleted = onBack }) {
  let entry = initial, active = true, busy = false;
  const scope = getDataContext(), selected = new Set();
  const route = `#tabela-precos/${encodeURIComponent(entry.id)}`;
  history.replaceState(null, "", route);
  const current = () => active && root.isConnected && location.hash === route &&
    scope?.companyId === getDataContext()?.companyId && scope?.user?.id === getDataContext()?.user?.id;
  const q = (selector) => root.querySelector(selector);
  const editable = () => entry.status === "draft";
  const status = (text) => { if (current()) q(".tp-status").textContent = text; };
  function sync() {
    const items = entry.items || [], all = q(".tp-item-select-all");
    if (all) {
      all.checked = items.length > 0 && selected.size === items.length;
      all.indeterminate = selected.size > 0 && selected.size < items.length;
    }
    if (q(".tp-item-selected")) q(".tp-item-selected").textContent = `${selected.size} selecionado(s)`;
    if (q(".tp-remove-selected")) q(".tp-remove-selected").disabled = busy || !selected.size;
    root.querySelectorAll("[data-item-check]").forEach((input) => {
      const checked = selected.has(input.dataset.itemCheck);
      input.checked = checked;
      input.closest(".tp-row").classList.toggle("is-selected", checked);
      input.closest(".tp-row").querySelector(".tp-selection-state").textContent = checked ? "✓ Selecionado" : "Não selecionado";
    });
  }
  function draw(message = "") {
    if (!current()) return;
    const items = entry.items || [];
    root.innerHTML = `${chrome()}<section class="tp-module tp-promotion-detail">
      <nav class="tp-breadcrumb" aria-label="Caminho da promoção"><button type="button" class="tp-back-link">Tabela de preços</button><span aria-hidden="true">/</span><span aria-current="page">${esc(entry.name)}</span></nav>
      <div class="tp-toolbar"><button class="button secondary tp-back" type="button">← Voltar às promoções</button><span class="tp-status-pill">${entry.status === "draft" ? "Rascunho" : entry.status === "sent" ? "Enviado para impressão" : "Finalizado"}</span></div>
      <div class="card tp-promotion-header"><div><h2>${esc(entry.name)}</h2><p>${date(entry.start)} a ${date(entry.end)}</p>${entry.notes ? `<p class="tp-promotion-notes">${esc(entry.notes)}</p>` : ""}</div>${editable() ? '<button class="button secondary tp-edit-header" type="button">Editar promoção</button>' : ""}</div>
      <div class="tp-toolbar"><div><h2>Produtos da promoção</h2><p class="tp-help">${items.length} produto(s)${editable() ? " · Configure o preço e o modelo de cada cartaz antes de enviar." : " · Dados preservados para impressão."}</p></div>${editable() ? '<button class="button primary tp-add-products" type="button">+ Adicionar produtos</button>' : ""}</div>
      <p class="tp-status" role="status" aria-live="polite">${esc(message)}</p>
      ${editable() && items.length ? '<div class="tp-toolbar tp-item-batch"><label class="tp-checkbox"><input type="checkbox" class="tp-item-select-all">Selecionar todos os produtos</label><div class="tp-actions"><span class="tp-item-selected"></span><button type="button" class="button secondary tp-danger tp-remove-selected" disabled>Excluir selecionados</button></div></div>' : ""}
      <div class="tp-grid">${items.map((item) => `<article class="card tp-row" data-item="${esc(item.id)}">
      ${editable() ? `<label class="tp-checkbox"><input type="checkbox" data-item-check="${esc(item.id)}"><span class="tp-sr">Selecionar ${esc(item.name)}</span></label>` : ""}
      <div class="tp-product-photo">${photoMarkup(item.productSnapshot?.photo || item.photo, item.name)}</div><div class="tp-row-main"><h2>${esc(item.name || item.productSnapshot?.name)}</h2><strong class="tp-price">${esc(price(item))}</strong>
      <p>${esc(item.templateSnapshot?.name || item.templateName || "Modelo pendente")} · ${esc(item.quantity || 1)} cópia(s)</p>${editable() ? '<span class="tp-selection-state">Não selecionado</span>' : ""}</div>
      ${editable() ? `<div class="tp-row-actions"><button class="button secondary" type="button" data-edit-item="${esc(item.id)}">Configurar cartaz</button><button class="button secondary tp-danger" type="button" data-remove-item="${esc(item.id)}">Excluir</button></div>` : ""}</article>`).join("") || '<div class="card tp-empty"><h2>Adicione os produtos da promoção</h2><p>Escolha vários produtos do catálogo de uma só vez, com foto e identificação.</p><button class="button primary tp-add-products" type="button">Selecionar produtos</button></div>'}</div>
      <div class="tp-toolbar tp-promotion-bottom">${editable() ? '<button type="button" class="button secondary tp-danger tp-delete-promotion">Excluir promoção</button><button type="button" class="button primary tp-send-promotion">Enviar promoção para impressão</button>' : entry.status === "sent" ? '<button type="button" class="button secondary tp-reopen-promotion">Voltar ao rascunho</button><button type="button" class="button primary tp-promotion-pdf">Gerar PDF</button>' : ""}</div><div class="tp-pdf-host"></div></section>`;
    q(".tp-back").onclick = onBack;
    q(".tp-back-link").onclick = onBack;
    q(".tp-edit-header")?.addEventListener("click", (event) => openPromotionDialog(root, {
      entry, trigger: event.currentTarget, isCurrent: current,
      onSave: (input) => store.updatePromotion(entry.id, input), onSaved: accept,
    }));
    root.querySelectorAll(".tp-add-products").forEach((button) => { button.onclick = () => openPromotionProductPicker(root, {
      selectedIds: items.map((item) => item.productId), trigger: button, isCurrent: current,
      onAdd: (ids) => store.addProducts(entry.id, ids), onSaved: accept,
    }); });
    q(".tp-item-select-all")?.addEventListener("change", (event) => {
      selected.clear(); if (event.target.checked) items.forEach((item) => selected.add(item.id)); sync();
    });
    q(".tp-grid").onchange = (event) => {
      const id = event.target.dataset.itemCheck;
      if (id) { event.target.checked ? selected.add(id) : selected.delete(id); sync(); }
    };
    q(".tp-grid").onclick = async (event) => {
      const button = event.target.closest("button");
      if (button?.dataset.removeItem) confirmRemove([button.dataset.removeItem]);
      const item = items.find((item) => item.id === button?.dataset.editItem);
      if (!item || busy) return;
      try {
        await loadTemplates();
        if (!current()) return;
        const currentItem = entry.items?.find((row) => row.id === item.id);
        if (!editable() || !currentItem) return status("A promoção mudou. Confira os produtos antes de editar.");
        openPromotionItemDialog(root, { item: currentItem, isCurrent: current, trigger: button,
          onSave: (input) => store.updateProduct(entry.id, currentItem.id, input), onSaved: accept });
      } catch (error) { status(error.message); }
    };
    q(".tp-remove-selected")?.addEventListener("click", () => confirmRemove([...selected]));
    q(".tp-delete-promotion")?.addEventListener("click", () => confirm("Excluir promoção?", "A promoção e seus produtos serão excluídos.", async () => {
      await store.deletePromotion(entry.id); if (current()) onDeleted("Promoção excluída.");
    }));
    q(".tp-send-promotion")?.addEventListener("click", () => mutate(() => store.send([entry.id]), "Promoção enviada para impressão."));
    q(".tp-reopen-promotion")?.addEventListener("click", () => mutate(() => store.reopen(entry.id), "Promoção reaberta como rascunho."));
    q(".tp-promotion-pdf")?.addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try {
        const { openPriceTablePdfDialog } = await import("../pdf.js");
        if (current()) await openPriceTablePdfDialog(q(".tp-pdf-host"), [entry], button);
      } catch (error) { status(error.message); }
      finally { if (button.isConnected) button.disabled = false; }
    });
    sync();
  }
  function accept(saved) {
    if (!current()) return;
    entry = saved; selected.clear(); draw("Alterações salvas.");
  }
  async function mutate(operation, message) {
    if (busy || !current()) return;
    busy = true; q(".tp-promotion-detail").inert = true;
    try {
      await operation();
      if (!current()) return;
      const saved = await loadPriceTableDetail(entry.id);
      if (!current()) return;
      if (!saved) return onDeleted("Esta promoção foi excluída em outra sessão.");
      entry = saved; selected.clear(); draw(message);
    } catch (error) { status(error.message); }
    finally { busy = false; if (current()) { q(".tp-promotion-detail").inert = false; sync(); } }
  }
  function confirm(title, text, operation) {
    if (busy) return;
    const dialog = document.createElement("dialog");
    dialog.className = "tp-confirm"; dialog.setAttribute("aria-label", title);
    dialog.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p><p role="status"></p><div class="tp-actions"><button class="button secondary" data-cancel type="button">Cancelar</button><button class="button primary" data-confirm type="button">Excluir</button></div>`;
    root.append(dialog);
    let pending = false;
    dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
    dialog.addEventListener("cancel", (event) => { if (pending) event.preventDefault(); });
    dialog.addEventListener("close", () => dialog.remove());
    dialog.querySelector("[data-confirm]").onclick = async () => {
      if (pending || !current()) return;
      pending = true; dialog.querySelectorAll("button").forEach((button) => { button.disabled = true; });
      try { await operation(); dialog.close(); }
      catch (error) { if (dialog.isConnected) dialog.querySelector('[role="status"]').textContent = error.message; }
      finally { pending = false; if (dialog.isConnected) dialog.querySelectorAll("button").forEach((button) => { button.disabled = false; }); }
    };
    dialog.showModal(); dialog.querySelector("[data-cancel]").focus();
  }
  function confirmRemove(ids) {
    if (!ids.length) return;
    confirm("Excluir produtos?", `Excluir ${ids.length} produto(s) desta promoção? O cadastro dos produtos será preservado.`, async () => {
      const saved = await store.removeProducts(entry.id, ids); accept(saved);
    });
  }
  draw();
  const stop = watchPriceTables(root, async () => {
    if (!current() || busy || root.querySelector("dialog[open]")) return;
    try {
      const saved = await loadPriceTableDetail(entry.id);
      if (!current()) return;
      if (!saved) return onDeleted("Esta promoção foi excluída em outra sessão.");
      if (saved._version !== entry._version) { entry = saved; selected.clear(); draw("Promoção atualizada."); }
    } catch (error) { status(error.message); }
  });
  return () => { active = false; stop(); };
}
