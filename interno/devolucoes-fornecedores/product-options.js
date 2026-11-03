import { normalizeSearch } from '../../shared/filters.js';

export function productChoices(products, query = '', selected = '', limit = 30) {
  const needle = normalizeSearch(query);
  const matches = products.filter((product) => normalizeSearch(`${product.name} ${product.unit}`).includes(needle));
  const visible = matches.slice(0, limit);
  const current = products.find((product) => product.id === selected);
  if (current && !visible.some((product) => product.id === selected)) visible.unshift(current);
  return { visible, total: matches.length };
}
