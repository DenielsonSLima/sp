import { watchCalendarPage } from "./realtime.js";
import { loadCalendarPage, loadCalendarCampaigns } from "./queries.js";
import { getDataContext } from "../../shared/data/api.js";
import { createCalendarItemsReader } from "./hooks/use-calendar-data.js";
import { createCalendarViews } from "./views/board.js";
import { typeNames, dateLabel, shortDate, monthLabel, option } from "./labels.js";
import { heading, escapeHtml as esc } from "../../shared/ui.js";
import { icon } from "../../shared/icons.js";
import { createEditorCloseGuard } from "./editor-guard.js";
import { holidaySources, HOLIDAY_MIN_YEAR } from "./holidays.js";
import {
  calendarStore as store,
  entryTypes,
  entryColors,
  localToday,
  localDate,
  validDate,
  addDays,
  shiftMonth,
  monthBounds,
  monthGrid,
  calendarOpeningPeriod,
  monthOptions,
  calendarItems,
  filterCalendarItems,
  entriesOnDate,
  agendaGroups,
} from "./state.js";

const state = { ...calendarOpeningPeriod(), view: null, type: "", query: "" };
let dispose,
  openingVersion = 0;

export async function render(root) {
  dispose?.();
  const opening = ++openingVersion,
    route = location.hash;
  Object.assign(state, calendarOpeningPeriod());
  state.view ||= window.matchMedia("(max-width:760px)").matches ? "agenda" : "month";
  const scope = getDataContext();
  let campaigns = await loadCalendarPage(state.month);
  if (!root.isConnected || opening !== openingVersion || route !== location.hash ||
    scope?.companyId !== getDataContext()?.companyId || scope?.user?.id !== getDataContext()?.user?.id) return;
  root.innerHTML = `<section class="calendar-module">
    ${heading("OFERTAS E DIVULGAÇÃO", "Calendário")}
    <div class="calendar-toolbar"><div class="calendar-period-nav"><button class="button secondary calendar-arrow" type="button" data-action="previous" aria-label="Mês anterior">‹</button><h2 class="calendar-period" aria-live="polite"></h2><button class="button secondary calendar-arrow" type="button" data-action="next" aria-label="Próximo mês">›</button><button class="button secondary" type="button" data-action="today">Hoje</button></div><button class="button primary" type="button" data-action="new">${icon("plus")} Novo registro</button></div>
    <section class="card calendar-filters" aria-label="Filtros do calendário"><label class="calendar-search">Buscar no calendário<input name="calendar-query" type="search" maxlength="200" placeholder="Título, campanha ou detalhes…" value="${esc(state.query)}"></label><label>Tipo de registro<select name="calendar-type">${option("", "Todos os tipos", state.type)}${Object.entries(
      typeNames,
    )
      .map(([key, label]) => option(key, label, state.type))
      .join("")}</select></label><label>Mês/ano<select name="calendar-month" data-searchable="true">${monthOptions(
      state.month,
    )
      .map((item) => option(item.value, item.label, state.month.slice(0, 7)))
      .join(
        "",
      )}</select></label><button class="button secondary calendar-clear" data-action="clear" type="button">Limpar filtros</button></section>
    <div class="calendar-view-bar"><p class="calendar-count" aria-live="polite"></p><div class="calendar-view-switch module-tabs" role="group" aria-label="Visualização do calendário"><button type="button" data-action="view" data-view="month">Mês</button><button type="button" data-action="view" data-view="agenda">Agenda</button></div></div>
    <p class="calendar-warning" role="alert"></p><p class="calendar-feedback" role="status" aria-live="polite"></p><div class="calendar-seasonal"></div><div class="calendar-board"></div>
    <p class="calendar-holiday-coverage" role="status"></p><p class="calendar-sources">Fontes oficiais dos feriados: ${holidaySources.map((source) => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a>`).join(" · ")}</p>
  </section>`;
  const section = root.querySelector(".calendar-module");
  const signalController = new AbortController();
  const signal = signalController.signal;
  let removed = false, campaignVersion = 0;
  const connected = () => !removed && section.isConnected && scope?.companyId === getDataContext()?.companyId &&
    scope?.user?.id === getDataContext()?.user?.id;
  const readItems = createCalendarItemsReader(() => store.list(), () => campaigns);
  const filtered = () => filterCalendarItems(readItems(state.month), { query: state.query, type: state.type });
  const feedback = (text) => {
    if (connected()) section.querySelector(".calendar-feedback").textContent = text;
  };
  const focusDay = () => section.querySelector(`[data-day="${state.selected}"]`)?.focus({ preventScroll: true });

  const { monthMarkup, agendaMarkup, seasonalMarkup } = createCalendarViews(state);
  function draw() {
    if (!connected()) return;
    const matches = filtered(),
      items = matches.filter((item) => item.type !== "season" || state.type === "season"),
      monthItems = filterCalendarItems(matches, monthBounds(state.month));
    const periods = state.type === "" ? monthItems.filter((item) => item.type === "season") : [];
    section.querySelector(".calendar-period").textContent = monthLabel(state.month);
    const monthSelect = section.querySelector("[name=calendar-month]"),
      options = monthOptions(state.month);
    if ([...monthSelect.options].map((item) => item.value).join(",") !== options.map((item) => item.value).join(","))
      monthSelect.innerHTML = options.map((item) => option(item.value, item.label, state.month.slice(0, 7))).join("");
    monthSelect.value = state.month.slice(0, 7);
    section.querySelector("[data-action=previous]").disabled = state.month === "0001-01-01";
    section.querySelector("[data-action=next]").disabled = state.month === "9999-12-01";
    section
      .querySelectorAll("[data-action=view]")
      .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === state.view)));
    const count = (type) => monthItems.filter((item) => item.type === type || item.categories?.includes(type)).length;
    section.querySelector(".calendar-count").textContent =
      `${monthItems.length} registro(s) no mês · ${count("promotion")} promoção(ões), ${count("event")} evento(s), ${count("note")} anotação(ões), ${count("holiday")} feriado(s), ${count("commercial")} data(s) comercial(is), ${count("season")} período(s) sugerido(s)`;
    section.querySelector(".calendar-holiday-coverage").textContent =
      Number(state.month.slice(0, 4)) < HOLIDAY_MIN_YEAR
        ? `A referência de feriados nacionais está disponível a partir de ${HOLIDAY_MIN_YEAR}.`
        : "";
    section.querySelector(".calendar-warning").textContent = store.warning || "";
    section.querySelector(".calendar-seasonal").innerHTML = seasonalMarkup(periods);
    section.querySelector(".calendar-board").innerHTML =
      state.view === "month" ? monthMarkup(items) : agendaMarkup(items);
  }
  async function refreshCampaigns() {
    const version = ++campaignVersion, month = state.month;
    try {
      const next = await loadCalendarCampaigns(month);
      if (!connected() || version !== campaignVersion || month !== state.month) return;
      campaigns = next;
      draw();
    } catch (error) {
      if (connected() && version === campaignVersion) feedback(error.message);
    }
  }
  function selectDate(date, focus = false) {
    if (!validDate(date)) return;
    const previousMonth = state.month;
    state.selected = date;
    state.month = monthBounds(date).start;
    draw();
    if (previousMonth !== state.month) void refreshCampaigns();
    if (focus) focusDay();
  }
  function navigate(amount) {
    try {
      const month = shiftMonth(state.month, amount);
      state.month = monthBounds(month).start;
      state.selected = shiftMonth(state.selected, amount);
      draw();
      void refreshCampaigns();
    } catch (error) {
      feedback(error.message);
    }
  }
  function closeDialog(dialog, trigger, fallback = true) {
    dialog.close();
    dialog.remove();
    if (trigger?.isConnected) trigger.focus();
    else if (fallback)
      (section.querySelector(`[data-day="${state.selected}"]`) || section.querySelector("[data-action=new]"))?.focus({
        preventScroll: true,
      });
  }
  function showEditor(trigger, id = "", date = state.selected) {
    if (section.querySelector("dialog")) return;
    let entry;
    try {
      entry = id ? store.get(id) : { title: "", date, time: "", type: "event", color: "blue", notes: "" };
    } catch (error) {
      feedback(error.message);
      draw();
      return;
    }
    const dialog = document.createElement("dialog");
    dialog.className = "calendar-dialog";
    dialog.setAttribute("aria-labelledby", "calendar-editor-title");
    dialog.innerHTML = `<form><div class="calendar-dialog-heading"><div><span class="eyebrow">CALENDÁRIO DA LOJA</span><h2 id="calendar-editor-title">${id ? "Editar registro" : "Novo registro"}</h2></div><button class="button secondary calendar-close" type="button" data-close aria-label="Fechar formulário">×</button></div><div class="calendar-fields"><label class="calendar-wide">Título<input name="title" required maxlength="120" value="${esc(entry.title)}" placeholder="Ex.: Reunião da equipe"></label><label>Tipo<select name="type">${Object.entries(
      entryTypes,
    )
      .map(([key, label]) => option(key, label, entry.type))
      .join("")}</select></label><label>Cor<select name="color">${Object.entries(entryColors)
      .map(([key, label]) => option(key, label, entry.color))
      .join(
        "",
      )}</select></label><label>Data<input name="date" type="date" min="0001-01-01" max="9999-12-31" required value="${entry.date}"></label><label>Horário (opcional)<input name="time" type="time" value="${entry.time}"></label><label class="calendar-wide">Detalhes (opcional)<textarea name="notes" maxlength="4000" rows="4" placeholder="Anotações e informações para lembrar depois…">${esc(entry.notes)}</textarea></label></div><p class="calendar-form-error" role="alert"></p><div class="calendar-dialog-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="submit">Salvar registro</button></div></form>`;
    section.append(dialog);
    dialog.showModal();
    const form = dialog.querySelector("form");
    const guard = createEditorCloseGuard({ form, host: section, onClose: () => closeDialog(dialog, trigger) });
    dialog.querySelector("[data-cancel]").onclick = guard.requestClose;
    dialog.querySelector("[data-close]").onclick = guard.requestClose;
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      guard.requestClose();
    });
    form.onsubmit = async (event) => {
      event.preventDefault();
      try {
        const values = Object.fromEntries(new FormData(event.currentTarget));
        const saved = id ? await store.update(id, values) : await store.create(values);
        guard.dispose();
        closeDialog(dialog, trigger, false);
        selectDate(saved.date);
        (section.querySelector(`[data-day="${state.selected}"]`) || section.querySelector("[data-action=new]"))?.focus({
          preventScroll: true,
        });
        feedback(
          `${id ? "Alterações salvas" : "Registro salvo"}.${state.query || state.type ? " Os filtros atuais continuam aplicados." : ""}`,
        );
      } catch (error) {
        dialog.querySelector(".calendar-form-error").textContent = error.message;
      }
    };
    dialog.querySelector("[name=title]").focus();
  }
  function confirmDelete(trigger, id) {
    if (section.querySelector("dialog")) return;
    let entry;
    try {
      entry = store.get(id);
    } catch (error) {
      feedback(error.message);
      draw();
      return;
    }
    const dialog = document.createElement("dialog");
    dialog.className = "calendar-dialog calendar-confirm";
    dialog.setAttribute("aria-labelledby", "calendar-delete-title");
    dialog.innerHTML = `<h2 id="calendar-delete-title">Excluir ${entry.type === "note" ? "anotação" : "evento"}?</h2><p>“${esc(entry.title)}”, em ${shortDate(entry.date)}, será excluído do calendário da empresa. Esta ação não pode ser desfeita.</p><p class="calendar-form-error" role="alert"></p><div class="calendar-dialog-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="button" data-confirm-delete>Excluir registro</button></div>`;
    section.append(dialog);
    dialog.showModal();
    const close = () => closeDialog(dialog, trigger);
    dialog.querySelector("[data-cancel]").onclick = close;
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.querySelector("[data-confirm-delete]").onclick = async () => {
      try {
        await store.remove(id);
        closeDialog(dialog, trigger, false);
        draw();
        (section.querySelector(`[data-day="${state.selected}"]`) || section.querySelector("[data-action=new]"))?.focus({
          preventScroll: true,
        });
        feedback("Registro excluído.");
      } catch (error) {
        dialog.querySelector(".calendar-form-error").textContent = error.message;
      }
    };
    dialog.querySelector("[data-cancel]").focus();
  }
  section.addEventListener(
    "click",
    (event) => {
      const day = event.target.closest("[data-day]");
      if (day) {
        selectDate(day.dataset.day, true);
        return;
      }
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "previous" || action === "next") navigate(action === "previous" ? -1 : 1);
      if (action === "today") selectDate(localToday());
      if (action === "view") {
        state.view = button.dataset.view;
        draw();
      }
      if (action === "clear") {
        state.type = "";
        state.query = "";
        section.querySelector("[name=calendar-type]").value = "";
        section.querySelector("[name=calendar-query]").value = "";
        draw();
        feedback("Filtros limpos.");
      }
      if (action === "new") showEditor(button, "", button.dataset.date || state.selected);
      if (action === "edit") showEditor(button, button.dataset.id);
      if (action === "delete") confirmDelete(button, button.dataset.id);
    },
    { signal },
  );
  section.addEventListener(
    "keydown",
    (event) => {
      const button = event.target.closest("[data-day]");
      if (!button || event.altKey || event.ctrlKey || event.metaKey) return;
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let date;
      try {
        if (Object.hasOwn(offsets, event.key)) date = addDays(button.dataset.day, offsets[event.key]);
        else if (event.key === "Home")
          date = addDays(button.dataset.day, -(localDate(button.dataset.day).getDay() + 6) % 7);
        else if (event.key === "End")
          date = addDays(button.dataset.day, 6 - ((localDate(button.dataset.day).getDay() + 6) % 7));
        else if (event.key === "PageUp" || event.key === "PageDown")
          date = shiftMonth(button.dataset.day, event.key === "PageUp" ? -1 : 1);
        else return;
        event.preventDefault();
        selectDate(date, true);
      } catch {
        event.preventDefault();
      }
    },
    { signal },
  );
  section.querySelector("[name=calendar-query]").oninput = (event) => {
    state.query = event.target.value;
    draw();
  };
  section.querySelector("[name=calendar-type]").onchange = (event) => {
    state.type = event.target.value;
    draw();
  };
  section.querySelector("[name=calendar-month]").onchange = (event) => {
    const date = `${event.target.value}-01`;
    if (validDate(date)) selectDate(date);
    else {
      event.target.value = state.month.slice(0, 7);
      feedback("Escolha um mês válido.");
    }
  };
  const stopRealtime = watchCalendarPage(section, {
    refreshEntries: async () => {
      await store.reload();
      if (connected()) draw();
    },
    refreshCampaigns,
  });
  const observer = new MutationObserver(() => {
    if (!section.isConnected) cleanup();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  function cleanup() {
    if (removed) return;
    removed = true;
    campaignVersion++;
    stopRealtime();
    signalController.abort();
    observer.disconnect();
    section.querySelectorAll("dialog").forEach((dialog) => dialog.close());
  }
  window.addEventListener(
    "focus",
    async () => {
      try {
        await Promise.all([store.reload(), refreshCampaigns()]);
        if (section.isConnected) draw();
      } catch (error) {
        feedback(error.message);
      }
    },
    { signal },
  );
  dispose = cleanup;
  draw();
}
