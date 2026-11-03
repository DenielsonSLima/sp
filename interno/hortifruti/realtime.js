import { watchResources } from '../cadastros/remote.js';
export const watchDomain = (root, refresh) => watchResources(root, ['hortifruti_receipts'], refresh);
