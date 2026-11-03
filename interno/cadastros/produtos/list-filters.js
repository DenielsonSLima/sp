import { filterValues } from "../../../shared/filters.js";
import { escapeHtml } from "../../../shared/ui.js";

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
export const sortedOptions = (rows) => [...rows].sort((a, b) => collator.compare(a.label, b.label));
export const selectedValues = (select) => [...select.selectedOptions].map((option) => option.value).filter(Boolean);
export const allOption = (label, selected) =>
  `<option value="" ${filterValues(selected).length ? "" : "selected"}>${escapeHtml(label)}</option>`;

export function subcategoryOptions(categories, subcategories, selected) {
  const names = filterValues(selected);
  const parents = new Set(categories.filter((row) => names.includes(row.name)).map((row) => row.id));
  return sortedOptions(subcategories
    .filter((row) => !names.length || parents.has(row.parentId))
    .map((row) => ({ value: row.id, label: row.name })));
}
