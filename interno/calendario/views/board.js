import { escapeHtml as esc } from "../../../shared/ui.js";
import { entriesOnDate, monthGrid, localToday, localDate } from "../model.js";
import { retailAgendaGroups } from "../commercial.js";
import { typeNames, shortDate, dateLabel, monthLabel } from "../labels.js";

export function createCalendarViews(state) {
  function itemMarkup(item) {
    const promotion = item.type === "promotion",
      holiday = item.type === "holiday",
      season = item.type === "season",
      commercial = item.type === "commercial";
    return `<article class="calendar-entry calendar-color-${esc(item.color)}" data-entry="${esc(item.id)}"><div class="calendar-entry-heading"><span class="calendar-type">${esc(typeNames[item.type])}</span>${item.categories?.includes("commercial") ? '<span class="calendar-type">Data comercial</span>' : ""}<span class="calendar-entry-time">${promotion || season ? `${shortDate(item.start)} a ${shortDate(item.end)}` : item.time || "Dia inteiro"}</span></div><h4>${esc(item.title)}</h4>${item.notes ? `<p class="calendar-entry-notes">${esc(item.notes)}</p>` : ""}<div class="calendar-entry-actions">${promotion ? `<a class="button secondary" href="${esc(item.href)}">Abrir campanha →</a>` : holiday ? `<a class="button secondary" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fonte oficial ↗</a>` : commercial || season ? (item.sourceUrl ? `<a class="button secondary" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${season ? "Sobre a data" : "Fonte da data"} ↗</a>` : "") : `<button class="button secondary" type="button" data-action="edit" data-id="${esc(item.sourceId)}" aria-label="Editar ${esc(item.title)}">Editar</button><button class="button calendar-delete" type="button" data-action="delete" data-id="${esc(item.sourceId)}" aria-label="Excluir ${esc(item.title)}">Excluir</button>`}</div></article>`;
  }
  function dayDetails(items) {
    const entries = entriesOnDate(items, state.selected);
    return `<aside class="card calendar-day-details" aria-labelledby="calendar-day-title"><div class="calendar-day-heading"><span class="eyebrow">DIA SELECIONADO</span><h3 id="calendar-day-title">${esc(dateLabel(state.selected))}</h3><button class="button secondary" type="button" data-action="new" data-date="${state.selected}">+ Adicionar neste dia</button></div>${entries.length ? entries.map(itemMarkup).join("") : '<p class="calendar-day-empty">Nenhum registro neste dia com os filtros atuais.</p>'}</aside>`;
  }
  function monthMarkup(items) {
    const days = monthGrid(state.month),
      now = localToday();
    const byDay = new Map(
      days.filter(Boolean).map((day) => [day, items.filter((item) => item.start <= day && item.end >= day)]),
    );
    return `<div class="calendar-month-layout"><div class="card calendar-month-card"><div class="calendar-grid-scroll"><div class="calendar-month-grid" role="grid" aria-label="${esc(monthLabel(state.month))}"><div class="calendar-week calendar-weekdays" role="row">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => `<span role="columnheader">${day}</span>`).join("")}</div>${Array.from(
      { length: days.length / 7 },
      (_, week) =>
        `<div class="calendar-week" role="row">${days
          .slice(week * 7, week * 7 + 7)
          .map((day) => {
            if (!day) return '<div class="calendar-day calendar-day-placeholder" role="gridcell"></div>';
            const entries = byDay.get(day),
              selected = day === state.selected;
            return `<div class="calendar-day ${day.slice(0, 7) !== state.month.slice(0, 7) ? "outside-month" : ""} ${day === now ? "is-today" : ""} ${selected ? "is-selected" : ""}" role="gridcell" aria-selected="${selected}"><button type="button" data-day="${day}" tabindex="${selected ? "0" : "-1"}" ${day === now ? 'aria-current="date"' : ""} aria-label="${esc(dateLabel(day))}, ${entries.length} registro(s)"><span class="calendar-day-number">${Number(day.slice(-2))}</span><span class="calendar-day-items" aria-hidden="true">${entries
              .slice(0, 2)
              .map(
                (item) =>
                  `<span class="calendar-day-chip calendar-color-${esc(item.color)}">${item.time ? `${esc(item.time)} ` : ""}${esc(item.title)}</span>`,
              )
              .join(
                "",
              )}${entries.length > 2 ? `<span class="calendar-more">+ ${entries.length - 2}<span class="calendar-more-label"> registro(s)</span></span>` : ""}</span></button></div>`;
          })
          .join("")}</div>`,
    ).join(
      "",
    )}</div></div><div class="calendar-grid-help">Selecione um dia para ver os registros. Use as setas do teclado para navegar.</div></div>${dayDetails(items)}</div>`;
  }
  function agendaMarkup(items) {
    const groups = retailAgendaGroups(items, state.month);
    return `<div class="calendar-agenda" aria-label="Agenda de ${esc(monthLabel(state.month))}">${groups.length ? groups.map((group) => `<section class="card calendar-agenda-day ${group.date === localToday() ? "is-today" : ""}" aria-labelledby="agenda-${group.date}"><div class="calendar-agenda-date"><span class="calendar-agenda-number">${Number(group.date.slice(-2))}</span><h3 id="agenda-${group.date}">${esc(localDate(group.date).toLocaleDateString("pt-BR", { weekday: "long", month: "long" }))}${group.date === localToday() ? '<span class="calendar-today-label">Hoje</span>' : ""}</h3><button class="button secondary" type="button" data-action="new" data-date="${group.date}" aria-label="Adicionar registro em ${esc(dateLabel(group.date))}">+ Adicionar</button></div><div class="calendar-agenda-items">${group.entries.map(itemMarkup).join("")}</div></section>`).join("") : `<div class="card calendar-empty"><div class="calendar-empty-symbol" aria-hidden="true">▦</div><h3>Nenhum registro neste mês</h3><p>${state.query || state.type ? "Ajuste os filtros para encontrar outros registros." : "Adicione eventos e anotações. Suas campanhas também aparecem aqui nas datas cadastradas."}</p><button class="button secondary" type="button" data-action="${state.query || state.type ? "clear" : "new"}">${state.query || state.type ? "Limpar filtros" : "+ Adicionar um registro"}</button></div>`}</div>`;
  }
  function seasonalMarkup(items) {
    if (!items.length) return "";
    return `<section class="card calendar-seasonal-panel" aria-labelledby="calendar-seasonal-title"><div class="calendar-seasonal-heading"><h3 id="calendar-seasonal-title">Períodos sazonais do mês</h3><p>Janelas sugeridas para planejar as campanhas da loja.</p></div><div class="calendar-seasonal-grid">${items.map(itemMarkup).join("")}</div></section>`;
  }
  return { monthMarkup, agendaMarkup, seasonalMarkup };
}
