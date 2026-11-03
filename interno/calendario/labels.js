import { escapeHtml as esc } from "../../shared/ui.js";
import { entryTypes, localDate } from "./model.js";

export const typeNames = {
  promotion: "Promoção",
  holiday: "Feriado nacional",
  commercial: "Data comercial",
  season: "Sugestão sazonal",
  ...entryTypes,
};
export const shortDate = (value) => value.split("-").reverse().join("/");
export const dateLabel = (value) =>
  localDate(value).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const monthLabel = (value) => localDate(value).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
export const option = (value, label, selected) =>
  `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
