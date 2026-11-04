import { usePagedList } from "../../hooks/use-paged-list.js";
import { loadPriceTablePage, loadPriceTableDetail, rememberPriceTablePage } from "../queries.js";
import { priceTableStore as store } from "../state.js";
import { getDataContext } from "../services.js";
import { watchPriceTables } from "../realtime.js";
import { listFrame, rowMarkup, batchMarkup, tabs, help } from "./list-markup.js";

export function renderPriceTableList(root, { state, chrome, rawDrafts, message, onOpen, onCreate }) {
  root.innerHTML = listFrame(state, chrome);
  const q = (selector) => root.querySelector(selector), grid = q(".tp-grid"), scope = getDataContext();
  const selection = new Set();
  let active = true, rows = [], busy = false;
  const current = () => active && grid.isConnected && location.hash === "#tabela-precos" &&
    scope?.companyId === getDataContext()?.companyId && scope?.user?.id === getDataContext()?.user?.id;
  const status = (text) => { if (current()) q(".tp-status").textContent = text; };
  function updateSelection() {
    const box = q(".tp-select-all");
    if (!box) return;
    box.checked = rows.length > 0 && selection.size === rows.length;
    box.indeterminate = selection.size > 0 && selection.size < rows.length;
    q(".tp-selected").textContent = `${selection.size} selecionado(s)`;
    grid.querySelectorAll("[data-check]").forEach((input) => {
      const selected = selection.has(input.dataset.check), row = input.closest(".tp-row");
      row.classList.toggle("is-selected", selected);
      row.querySelector(".tp-selection-state").textContent = selected ? "Selecionado" : "Não selecionado";
    });
    root.querySelectorAll(".tp-send, .tp-pdf, .tp-finalize").forEach((button) => {
      button.disabled = busy || !selection.size;
    });
  }
  function updateControls() {
    root.querySelectorAll("[data-tab]").forEach((button) => {
      const selected = state.tab === button.dataset.tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    q(".tp-history-field").hidden = state.tab !== "finalized";
    q(".tp-history").value = state.archived ? "archived" : "recent";
    q(".tp-help").textContent = help(state.tab);
  }
  const paged = usePagedList(root, {
    filters: state, grid, error: ".tp-status", pagination: ".tp-pagination", current,
    load: (value) => loadPriceTablePage({ page: value.page, perPage: 20, query: value.query,
      status: value.tab, archived: value.archived ? "archived" : "active" }),
    card: (row) => rowMarkup(row, state, rawDrafts.has(row.id), selection.has(row.id)),
    empty: '<div class="card tp-empty"><h2>Nenhum item encontrado.</h2><p>Os itens desta etapa aparecerão aqui. Ajuste a busca ou crie uma tabela.</p></div>',
    onPage: (result) => {
      rows = result.items;
      rememberPriceTablePage(rows);
      for (const id of selection) if (!rows.some((row) => row.id === id)) selection.delete(id);
      for (const [key] of tabs) q(`[data-tab="${key}"] span`).textContent = result.counts?.[key] ?? "—";
      q(".tp-batch").innerHTML = batchMarkup(state.tab, rows.length);
      q(".tp-total").textContent = `${result.total} item(ns)`;
      grid.querySelectorAll("[data-check]").forEach((input) => { input.checked = selection.has(input.dataset.check); });
      updateSelection();
      grid.inert = false;
      q(".tp-batch").inert = false;
    },
  });
  const refresh = () => paged.refresh();
  function change(patch, debounce = false) {
    Object.assign(state, patch);
    selection.clear();
    grid.inert = true;
    q(".tp-batch").inert = true;
    updateControls();
    void paged.change({}, { debounce });
  }
  async function mutate(action, keys, success) {
    if (busy || !current()) return;
    if (!keys.length) return status("Selecione os itens desejados.");
    busy = true;
    updateSelection();
    try {
      if (action === "send" && keys.some((id) => rawDrafts.has(id)))
        throw Error("Há alterações não salvas em um item selecionado. Abra o rascunho e salve antes de enviar.");
      if (action === "restore") await store.restore(keys[0]);
      else await store[action](keys);
      if (!current()) return;
      selection.clear();
      if (action === "send") state.tab = "sent";
      updateControls();
      await refresh();
      status(success);
    } catch (error) { status(error.message); }
    finally { busy = false; if (current()) updateSelection(); }
  }
  function confirmDelete(id) {
    if (busy) return;
    const row = rows.find((row) => row.id === id);
    if (!row) return;
    const dialog = document.createElement("dialog");
    dialog.className = "tp-confirm";
    dialog.setAttribute("aria-label", "Excluir rascunho");
    dialog.innerHTML = '<h2>Excluir rascunho?</h2><p>O rascunho e seus produtos serão removidos. Esta ação não pode ser desfeita.</p><p class="tp-delete-status" role="alert"></p><div class="tp-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="button" data-confirm>Excluir rascunho</button></div>';
    root.append(dialog);
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
    dialog.onclose = () => { dialog.remove(); q(".tp-new")?.focus(); };
    dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
    dialog.querySelector("[data-confirm]").onclick = async () => {
      if (busy || !current()) return;
      busy = true;
      dialog.querySelectorAll("button").forEach((button) => { button.disabled = true; });
      try {
        await store.deletePromotion(id);
        if (!current()) return;
        rawDrafts.delete(id);
        selection.delete(id);
        dialog.close();
        await refresh();
        status("Rascunho excluído.");
      } catch (error) {
        if (dialog.isConnected) dialog.querySelector(".tp-delete-status").textContent = error.message;
      } finally {
        busy = false;
        if (dialog.isConnected) dialog.querySelectorAll("button").forEach((button) => { button.disabled = false; });
        if (current()) updateSelection();
      }
    };
    dialog.showModal();
    dialog.querySelector("[data-cancel]").focus();
  }
  function confirmFinalize() {
    const keys = [...selection];
    if (!keys.length) return status("Selecione os itens impressos.");
    const dialog = document.createElement("dialog");
    dialog.className = "tp-confirm";
    dialog.setAttribute("aria-label", "Confirmar impressão");
    dialog.innerHTML = `<h2>Confirmar impressão</h2><p>Os ${keys.length} item(ns) selecionado(s) já foram impressos? Os registros finalizados não poderão ser editados.</p><div class="tp-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="button" data-confirm>Sim, finalizar impressos</button></div>`;
    root.append(dialog);
    dialog.addEventListener("close", () => { dialog.remove(); q(".tp-finalize")?.focus(); });
    dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
    dialog.querySelector("[data-confirm]").onclick = () => {
      dialog.close();
      void mutate("finalize", keys, "Impressão confirmada. Itens disponíveis em Finalizado.");
    };
    dialog.showModal();
    dialog.querySelector("[data-cancel]").focus();
  }
  async function pdf(button) {
    if (!selection.size) return status("Selecione os itens que deseja imprimir.");
    button.disabled = true;
    const keys = [...selection], host = q(".tp-pdf-host");
    try {
      const [records, { openPriceTablePdfDialog }] = await Promise.all([
        Promise.all(keys.map(loadPriceTableDetail)), import("../pdf.js"),
      ]);
      if (records.some((row) => !row || row.status !== "sent")) throw Error("A fila mudou. Atualize os itens antes de imprimir.");
      if (current() && host.isConnected) await openPriceTablePdfDialog(host, records, button);
    } catch (error) { status(error.message); }
    finally { if (button.isConnected) button.disabled = false; }
  }
  q(".tp-new").onclick = onCreate;
  q(".tp-search").oninput = (event) => change({ query: event.target.value }, true);
  q(".tp-history").onchange = (event) => change({ archived: event.target.value === "archived" });
  root.querySelectorAll("[data-tab]").forEach((button) => {
    button.onclick = () => change({ tab: button.dataset.tab, archived: false });
  });
  q(".tp-tabs").onkeydown = (event) => {
    const index = tabs.findIndex(([key]) => key === state.tab);
    const next = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const button = q(`[data-tab="${tabs[next][0]}"]`);
    button.click(); button.focus();
  };
  grid.onchange = (event) => {
    const id = event.target.dataset.check;
    if (!id) return;
    event.target.checked ? selection.add(id) : selection.delete(id);
    updateSelection();
  };
  grid.onclick = (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.open) onOpen(button.dataset.open);
    if (button?.dataset.delete) confirmDelete(button.dataset.delete);
    if (button?.dataset.restore) void mutate("restore", [button.dataset.restore], "Item restaurado no histórico.");
  };
  q(".tp-batch").onchange = (event) => {
    if (!event.target.matches(".tp-select-all")) return;
    selection.clear();
    if (event.target.checked) rows.forEach((row) => selection.add(row.id));
    grid.querySelectorAll("[data-check]").forEach((input) => { input.checked = event.target.checked; });
    updateSelection();
  };
  q(".tp-batch").onclick = (event) => {
    const button = event.target.closest("button");
    if (button?.matches(".tp-send")) void mutate("send", [...selection], "Itens enviados para a fila interna.");
    if (button?.matches(".tp-finalize")) confirmFinalize();
    if (button?.matches(".tp-pdf")) void pdf(button);
  };
  updateControls();
  const stop = watchPriceTables(root, refresh);
  void refresh().then(() => { if (message) status(message); });
  return () => { active = false; paged.dispose(); stop(); };
}
