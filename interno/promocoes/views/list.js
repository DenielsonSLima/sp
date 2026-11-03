import { usePagedList } from "../../hooks/use-paged-list.js";
import { escapeHtml as esc } from "../../../shared/ui.js";
import { loadCampaignPage } from "../queries.js";
import { watchCampaigns } from "../realtime.js";
import { getDataContext } from "../services.js";
import { localToday } from "../state.js";

export function renderCampaignList(root, { filters, chrome, onOpen, onCreate }) {
  const date = (value) => value.split("-").reverse().join("/");
  root.innerHTML = `${chrome('<button class="button primary campaign-new" type="button">Criar campanha</button>')}<div class="campaign-tabs module-tabs" role="tablist" aria-label="Situação das campanhas"><button role="tab" data-tab="active" type="button">Ativos</button><button role="tab" data-tab="finished" type="button">Finalizados</button></div><section class="card campaign-filters"><label>Buscar campanha<input class="campaign-query" type="search" value="${esc(filters.query)}" placeholder="Nome ou anotações..."></label><label>Período inicial<input class="campaign-start" type="date" value="${filters.start}"></label><label>Período final<input class="campaign-end" type="date" value="${filters.end}"></label><button class="button secondary campaign-clear" type="button">Limpar filtros</button></section><p class="campaign-status" role="status" aria-live="polite"></p><p class="campaign-count"></p><section class="campaign-grid" aria-label="Campanhas encontradas"></section><nav class="campaign-pagination" aria-label="Páginas de campanhas"><button class="button secondary campaign-prev" type="button">Anterior</button><span></span><button class="button secondary campaign-next" type="button">Próxima</button></nav>`;
  const q = (selector) => root.querySelector(selector), grid = q(".campaign-grid");
  const scope = getDataContext();
  let active = true;
  const current = () => active && grid.isConnected && location.hash === "#promocoes" &&
    scope?.companyId === getDataContext()?.companyId && scope?.user?.id === getDataContext()?.user?.id;
  const paged = usePagedList(root, {
    filters, grid, count: ".campaign-count", error: ".campaign-status", pagination: ".campaign-pagination", current,
    load: (value) => {
      if (value.start && value.end && value.start > value.end) throw Error("Informe um período válido.");
      return loadCampaignPage({ ...value, perPage: 12, status: value.tab });
    },
    formatCount: (page) => `${page.total} campanha(s)`,
    card: (c) => `<article class="card campaign-card"><span class="campaign-badge">${c.status === "finished" ? "Finalizada" : c.start > localToday() ? "Agendada" : "Ativa"}</span><h2>${esc(c.name)}</h2><p>${date(c.start)} a ${date(c.end)}</p><strong>${c.itemCount} produto(s)</strong><p class="campaign-card-notes">${esc(c.notes || "Sem anotações")}</p><button type="button" class="button secondary campaign-open" data-id="${esc(c.id)}">Abrir campanha →</button></article>`,
    empty: '<div class="card campaign-empty"><h2>Nenhuma campanha encontrada.</h2><p>Crie uma campanha ou ajuste os filtros.</p></div>',
  });
  function filter(debounce = false) {
    filters.query = q(".campaign-query").value;
    filters.start = q(".campaign-start").value;
    filters.end = q(".campaign-end").value;
    void paged.change({}, { debounce });
  }
  const selectTab = () => root.querySelectorAll("[data-tab]").forEach((button) =>
    button.setAttribute("aria-selected", String(button.dataset.tab === filters.tab)));
  q(".campaign-query").oninput = () => filter(true);
  q(".campaign-start").onchange = q(".campaign-end").onchange = () => filter();
  root.querySelectorAll("[data-tab]").forEach((button) => { button.onclick = () => {
    filters.tab = button.dataset.tab;
    selectTab(); filter();
  }; });
  q(".campaign-clear").onclick = () => {
    for (const name of ["query", "start", "end"]) q(`.campaign-${name}`).value = "";
    filter(); q(".campaign-query").focus();
  };
  grid.onclick = (event) => {
    const button = event.target.closest(".campaign-open");
    if (button) onOpen(button.dataset.id);
  };
  q(".campaign-new").onclick = onCreate;
  selectTab();
  const stop = watchCampaigns(root, paged.refresh);
  void paged.refresh();
  return () => { active = false; paged.dispose(); stop(); };
}
