import { createOperationalStore } from '../operational-store.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { calculate } from '../../shared/data/api.js';
import { repository } from '../../shared/repository.js';
const store = createOperationalStore('supplier_returns', undefined, { realtime: false });
export const readReturns = () => store.load();
export const returnSnapshots = () => store.list();
export const getReturnSnapshot = (id) => store.get(id);
export const runReturnCommand = (action, id, input) => store.run(action, id, input);
export const resetReturnService = () => store.reset();
export const previewReturn = (input) => calculate('supplier_return_preview', input);
export const readReturnProducts = () => repository.listProductMetadata();
clearOnContextChange('supplier_returns', resetReturnService);

import { loadPartners, partners } from '../cadastros/parceiros/state.js';
export async function readReturnSuppliers() {
  await loadPartners();
  return partners;
}

export const readReturnRecord = (id) => store.loadRecord(id);
export const readReturnPage = (filters) => store.loadPage(filters);
