export const normalizeSearch = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();

// Canonical sets keep equivalent multi-select filters on the same query key.
export function filterValues(value) {
  return [...new Set((Array.isArray(value) ? value : [value]).filter(Boolean).map(String))].sort();
}

export function compactFilter(value) {
  const values = filterValues(value);
  return values.length > 1 ? values : values[0] || '';
}
export function filterRecords(
  records,
  { query = '', category = '', categoryKey = 'category', searchKeys = ['name'] } = {},
) {
  const q = normalizeSearch(query);
  return records.filter(
    (item) =>
      (!category || normalizeSearch(item[categoryKey]) === normalizeSearch(category)) &&
      (!q || searchKeys.some((key) => normalizeSearch(item[key]).includes(q))),
  );
}
