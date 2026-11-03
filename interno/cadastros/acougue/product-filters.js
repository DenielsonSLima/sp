import { normalizeSearch } from '../../../shared/filters.js';

export const isButcherProduct = (product) => normalizeSearch(product.category) === 'acougue';
const subcategoryKey = (product) => product.subcategoryId || product.subcategory || '';
export const WITHOUT_SUBCATEGORY = '__without_subcategory__';
export function butcherSubcategories(products) {
  const options = new Map();
  for (const product of products.filter(isButcherProduct)) {
    const key = subcategoryKey(product);
    if (key) options.set(key, { value: key, label: product.subcategory || 'Subcategoria sem nome' });
  }
  const rows = [...options.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  if (products.some((p) => isButcherProduct(p) && !subcategoryKey(p)))
    rows.push({ value: WITHOUT_SUBCATEGORY, label: 'Sem subcategoria' });
  return rows;
}
export function filterButcherProducts(products, { query = '', unit = '', subcategory = '' } = {}) {
  const needle = normalizeSearch(query);
  return products.filter((p) => isButcherProduct(p) && ['KG', 'UN', 'UND'].includes(p.unit)
    && (!unit || (unit === 'UN' ? ['UN', 'UND'].includes(p.unit) : p.unit === unit))
    && (!subcategory || (subcategory === WITHOUT_SUBCATEGORY ? !subcategoryKey(p) : subcategoryKey(p) === subcategory))
    && normalizeSearch([p.name, p.code, p.subcategory].filter(Boolean).join(' ')).includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
