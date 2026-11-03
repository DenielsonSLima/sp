import { listRecords, listFlyerLibrary, getRecord, saveFlyerSnapshot, deleteRecord } from '../../shared/data/api.js';

/** The only transport boundary for saved artwork. Reads share the central QueryClient. */
export const flyerService = {
  list: () => listRecords('flyers'),
  metadata: (options) => listFlyerLibrary(options),
  get: (id) => getRecord('flyers', id),
  save: (record, options) => saveFlyerSnapshot(record, options),
  remove: (id, options) => deleteRecord('flyers', id, options),
};
