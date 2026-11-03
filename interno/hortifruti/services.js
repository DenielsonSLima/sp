import { createOperationalStore } from '../operational-store.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { repository } from '../../shared/repository.js';
const store = createOperationalStore('hortifruti_receipts', undefined, { realtime: false });
export const readHortifruti = () => store.load();
export const listHortifrutiSnapshots = () => store.list();
export const getHortifrutiSnapshot = (id) => store.get(id);
export const runHortifrutiCommand = (action, id, payload) => store.run(action, id, payload);
export const resetHortifrutiService = () => store.reset();
export const readProductCatalog = () => repository.listProductMetadata();
export const readProductPreviews = (rows, options) => repository.loadProductPreviews(rows, options);
clearOnContextChange('hortifruti_receipts', resetHortifrutiService);

export const readHortifrutiRecord = (id) => store.loadRecord(id);
export const readHortifrutiPage = (filters) => store.loadPage(filters);
