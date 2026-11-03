import { createOperationalStore } from '../operational-store.js';
import { getRecord } from '../../shared/data/api.js';
import { clearOnContextChange } from '../cadastros/remote.js';
const store = createOperationalStore('quotes', undefined, { realtime: false });
export const readQuoteSnapshots = () => store.load();
export const quoteSnapshots = () => store.list();
export const runQuoteCommand = (action, id, payload) => store.run(action, id, payload);
export const resetQuoteService = () => store.reset();
clearOnContextChange('quotes', resetQuoteService);

import { repository } from '../../shared/repository.js';
import { loadPartners } from '../cadastros/parceiros/state.js';
export const readQuoteProducts = () => repository.listProductMetadata();
export const readQuotePreviews = (rows, options) => repository.loadProductPreviews(rows, options);
export const loadQuoteProviders = () => loadPartners();

export const readQuoteRecord = (id) => store.loadRecord(id);
export const readQuotePage = (filters) => store.loadPage(filters);
// Inspect remote changes without advancing the version the user has actually viewed.
export const inspectQuoteRecord = (id) => getRecord('quotes', id);
export const acceptQuoteRecord = (record) => store.accept(record);
