import { loadButcherModels, loadButcherReceipts, listReceipts } from './services.js';
export const loadReceipts = () => loadButcherReceipts();
export const loadReceiptModels = () => loadButcherModels();
export const receiptSnapshots = () => listReceipts();
export { loadReceipt, loadReceiptPage } from './services.js';
