import { normalizeSearch } from '../../shared/filters.js';

const categoryKey = (product) => product.categoryId || product.category || '';
const subcategoryKey = (product) => product.subcategoryId || product.subcategory || '';
export function productPickerOptions(products, category = '') {
  const options = (rows, key, label) => [...new Map(rows.filter((row) => row[label])
    .map((row) => [key(row), { value: key(row), label: row[label] }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return {
    categories: options(products, categoryKey, 'category'),
    subcategories: options(products.filter((row) => !category || categoryKey(row) === category), subcategoryKey, 'subcategory'),
  };
}
export function filterPickerProducts(products, { query = '', category = '', subcategory = '' } = {}) {
  const needle = normalizeSearch(query);
  return products.filter((product) =>
    (!category || categoryKey(product) === category) &&
    (!subcategory || subcategoryKey(product) === subcategory) &&
    normalizeSearch([product.name, product.code, product.category, product.subcategory].filter(Boolean).join(' ')).includes(needle));
}
