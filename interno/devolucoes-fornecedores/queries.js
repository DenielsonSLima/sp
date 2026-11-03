import { normalizeSearch } from '../../shared/filters.js';
import { readReturns, returnSnapshots, getReturnSnapshot } from './services.js';
import { totals } from './formatting.js';
export const loadReturns = () => readReturns();
export { readReturnPage as loadReturnPage } from './services.js';
export function getReturn(id) {
  try {
    return getReturnSnapshot(id);
  } catch {
    return null;
  }
}
export function queryReturns({ query = '', status = '' } = {}) {
  const needle = normalizeSearch(query);
  return returnSnapshots().filter(
    (r) =>
      (!status || totals(r).status === status) &&
      (!needle ||
        normalizeSearch(
          [r.number, r.originalInvoice, r.supplier.name, r.reason, ...r.items.map((i) => i.name)].join(' '),
        ).includes(needle)),
  );
}

import { readReturnProducts, readReturnSuppliers } from './services.js';
export async function loadReturnCreateCatalog() {
  const [products, suppliers] = await Promise.all([readReturnProducts(), readReturnSuppliers()]);
  return { products, suppliers };
}

export { readReturnRecord as loadReturnDetail } from './services.js';
