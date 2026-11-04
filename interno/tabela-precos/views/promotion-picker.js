import { escapeHtml as esc } from "../../../shared/ui.js";
import { photoMarkup } from "../../cadastros/produtos/view.js";
import { loadPriceTableProductPage, loadPriceTableProductPreviews } from "../queries.js";

export function openPromotionProductPicker(root, {
  selectedIds = [], onAdd, onSaved = () => {}, isCurrent = () => true, trigger = null,
  loadPage = loadPriceTableProductPage, loadPreviews = loadPriceTableProductPreviews,
} = {}) {
  const existing = new Set(selectedIds), selection = new Set();
  const dialog = document.createElement("dialog");
  dialog.className = "tp-confirm tp-module tp-picker";
  dialog.setAttribute("aria-labelledby", "tp-picker-title");
  dialog.innerHTML = `<div class="tp-toolbar"><div><h2 id="tp-picker-title">Adicionar produtos</h2><p>Marque vários produtos e adicione todos de uma vez.</p></div><button class="button secondary" type="button" data-cancel>Fechar</button></div>
    <label>Buscar no catálogo<input type="search" class="tp-picker-search" placeholder="Nome ou código do produto"></label>
    <div class="tp-toolbar"><label class="tp-checkbox"><input type="checkbox" class="tp-picker-page-check">Selecionar disponíveis nesta página</label><strong class="tp-picker-count" role="status">0 selecionados</strong></div>
    <p class="tp-status" role="status" aria-live="polite"></p>
    <div class="tp-picker-columns" aria-hidden="true"><span></span><span>Foto</span><span>Produto</span><span>Código</span><span>Unidade</span><span>Seleção</span></div><div class="tp-picker-grid tp-picker-list"></div>
    <nav class="tp-toolbar" aria-label="Páginas do catálogo"><button type="button" class="button secondary tp-picker-prev">Anterior</button><span class="tp-picker-page"></span><button type="button" class="button secondary tp-picker-next">Próxima</button></nav>
    <div class="tp-picker-footer"><p>A seleção é mantida ao buscar ou trocar de página.</p><button class="button primary tp-picker-add" type="button" disabled>Adicionar selecionados</button></div>`;
  root.append(dialog);
  const q = (selector) => dialog.querySelector(selector);
  let rows = [], page = 1, total = 0, revision = 0, busy = false, loading = false, timer;
  const current = () => dialog.isConnected && dialog.open && isCurrent();
  const available = () => rows.filter((row) => !existing.has(row.id));
  function sync() {
    const choices = available(), checked = choices.filter((row) => selection.has(row.id)).length;
    q(".tp-picker-page-check").checked = choices.length > 0 && checked === choices.length;
    q(".tp-picker-page-check").indeterminate = checked > 0 && checked < choices.length;
    q(".tp-picker-page-check").disabled = loading || busy || !choices.length;
    q(".tp-picker-count").textContent = `${selection.size} selecionado(s)`;
    q(".tp-picker-add").disabled = busy || selection.size === 0;
    q(".tp-picker-add").textContent = busy ? "Adicionando…" : `Adicionar selecionados (${selection.size})`;
    q(".tp-picker-prev").disabled = loading || busy || page === 1;
    q(".tp-picker-next").disabled = loading || busy || page * 20 >= total;
    q(".tp-picker-search").disabled = busy;
    q("[data-cancel]").disabled = busy;
    q(".tp-picker-grid").inert = busy || loading;
    dialog.querySelectorAll("[data-product-check]").forEach((input) => {
      const chosen = selection.has(input.dataset.productCheck);
      input.checked = chosen;
      input.closest(".tp-picker-product").classList.toggle("is-selected", chosen);
      input.closest(".tp-picker-product").querySelector(".tp-picker-state").textContent = existing.has(input.dataset.productCheck) ? "Já adicionado" : chosen ? "✓ Selecionado" : "Selecionar";
    });
  }
  async function load() {
    const token = ++revision;
    loading = true;
    q(".tp-status").textContent = "Carregando produtos…";
    sync();
    try {
      const result = await loadPage({ page, query: q(".tp-picker-search").value, view: "cards" });
      if (!current() || token !== revision) return;
      rows = result.items; page = result.page; total = result.total;
      q(".tp-picker-grid").innerHTML = rows.map((row) => `<label class="tp-picker-product ${selection.has(row.id) ? "is-selected" : ""} ${existing.has(row.id) ? "is-added" : ""}">
        <input type="checkbox" data-product-check="${esc(row.id)}" ${existing.has(row.id) ? "disabled" : ""} ${selection.has(row.id) ? "checked" : ""}>
        <span class="tp-picker-photo" data-picker-photo="${esc(row.id)}">${photoMarkup(row.photo, row.name)}</span>
        <span class="tp-picker-identity"><strong>${esc(row.name)}</strong><small class="tp-picker-mobile-meta">${esc(row.code || "Sem código")} · ${esc(row.unit || "—")}</small></span>
        <span class="tp-picker-code">${esc(row.code || "Sem código")}</span><span class="tp-picker-unit">${esc(row.unit || "—")}</span><span class="tp-picker-state"></span></label>`).join("") || '<p class="tp-help">Nenhum produto encontrado com esta busca.</p>';
      q(".tp-picker-page").textContent = `Página ${page} · ${total} produto(s)`;
      q(".tp-status").textContent = "";
      loading = false; sync();
      void loadPreviews(rows, { isCurrent: () => current() && token === revision, onBatch: (batch) => {
        if (!current() || token !== revision) return;
        for (const product of batch) {
          const node = [...dialog.querySelectorAll("[data-picker-photo]")].find((node) => node.dataset.pickerPhoto === product.id);
          if (node) node.innerHTML = photoMarkup(product.photo, product.name);
        }
      } }).catch((error) => { if (current() && token === revision) q(".tp-status").textContent = error.message; });
    } catch (error) {
      if (current() && token === revision) q(".tp-status").textContent = error.message;
    } finally {
      if (current() && token === revision) { loading = false; sync(); }
    }
  }
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => { revision++; clearTimeout(timer); dialog.remove(); if (trigger?.isConnected) trigger.focus(); });
  q("[data-cancel]").onclick = () => dialog.close();
  q(".tp-picker-search").oninput = () => { clearTimeout(timer); page = 1; timer = setTimeout(load, 200); };
  q(".tp-picker-prev").onclick = () => { page--; void load(); };
  q(".tp-picker-next").onclick = () => { page++; void load(); };
  q(".tp-picker-page-check").onchange = (event) => { available().forEach((row) => event.target.checked ? selection.add(row.id) : selection.delete(row.id)); sync(); };
  q(".tp-picker-grid").onchange = (event) => {
    const id = event.target.dataset.productCheck;
    if (!id || existing.has(id)) return;
    event.target.checked ? selection.add(id) : selection.delete(id); sync();
  };
  q(".tp-picker-add").onclick = async () => {
    if (busy || !selection.size || !current()) return;
    busy = true; sync();
    try {
      const saved = await onAdd([...selection]);
      if (!current()) return dialog.close();
      dialog.close(); onSaved(saved);
    } catch (error) { if (current()) q(".tp-status").textContent = error.message; }
    finally { busy = false; if (current()) sync(); }
  };
  dialog.showModal();
  q(".tp-picker-search").focus();
  void load();
  return dialog;
}
