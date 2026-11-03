import { flyerService } from './services.js';

// Library lists use the deployed metadata RPC; full documents are read individually.
export const readFlyerRecords = () => flyerService.list();
export const readFlyerMetadata = (options) => flyerService.metadata(options);
export const readFlyerRecord = (id) => flyerService.get(id);
