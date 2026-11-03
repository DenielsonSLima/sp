import { runHortifrutiCommand, resetHortifrutiService } from './services.js';
import { queryHortifruti, getHortifruti } from './queries.js';
export { loadHortifruti } from './queries.js';
const cleanRemoteInput = (input) => ({
  ...input,
  ...(Array.isArray(input.items) ? { items: input.items.map(({ _computed, ...item }) => item) } : {}),
});
const remoteHortifruti = {
  list: queryHortifruti,
  get: getHortifruti,
  create: (input) => runHortifrutiCommand('create', null, cleanRemoteInput(input)),
  update: (id, input) => runHortifrutiCommand('update', id, cleanRemoteInput(input)),
  addProducts: (id, productIds) => runHortifrutiCommand('addProducts', id, { productIds }),
  removeProduct: (id, productId) => runHortifrutiCommand('removeProduct', id, { productId }),
  async autosave(id, input) {
    const response = await runHortifrutiCommand('autosave', id, cleanRemoteInput(input));
    return response.record ? response : { record: response, errors: response._errors || [] };
  },
  setPricingBatch: (id, productIds, patch) => runHortifrutiCommand('setPricingBatch', id, { productIds, patch }),
  setPrintPeriod: (id, input) => runHortifrutiCommand('setPrintPeriod', id, input),
  setPricing: (id, productId, patch) => runHortifrutiCommand('setPricing', id, { productId, patch }),
  finalize: (id, input) => runHortifrutiCommand('finalize', id, input),
  reopen: (id, input) => runHortifrutiCommand('reopen', id, input),
  advance: (id, stage, responsible) => runHortifrutiCommand('advance', id, { stage, responsible }),
  reset: resetHortifrutiService,
};
export const hortifrutiRepository = remoteHortifruti;
