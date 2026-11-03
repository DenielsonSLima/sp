// Diagnóstico sem rede: API real com transporte RPC/Storage simulado.
import { createDataApi } from '../../../shared/data/api.js';
import { createAutosaveQueue } from '../../../interno/hortifruti/autosave.js';

const calls = [], signs = [];
const rows = Array.from({ length: 200 }, (_, recordIndex) => ({
  id: `quote-${recordIndex}`, _version: 1,
  items: Array.from({ length: 5 }, (_, itemIndex) => {
    const productId = `p-${recordIndex}-${itemIndex}`;
    return { productId, name: productId, photoAssets: [{
      bucket: 'product-photos', path: `audit/products/${productId}/photo.png`,
      mimeType: 'image/png', size: 128, width: 100, height: 100, position: 0,
    }] };
  }),
}));
const client = {
  async rpc(name, args) {
    calls.push({ name, resource: args.p_resource });
    return { data: name === 'sp_list' ? rows : { ...rows[0], _version: 2 }, error: null };
  },
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  async removeChannel() {},
  storage: { from() { return { async createSignedUrls(paths) {
    signs.push(paths);
    return { data: paths.map(path => ({ path,
      signedUrl: `https://enhoierfwuwtzulznjxa.supabase.co/storage/v1/object/sign/product-photos/${path}?token=audit`,
    })), error: null };
  } }; } },
};
const api = createDataApi({ client });
await api.setContext({ companyId: 'audit', user: { id: 'audit' } });
await api.listRecords('quotes');
const first = { rpc: calls.length, signingBatches: signs.length, signedPaths: signs.flat().length };
await api.command('quotes', 'setOffer', 'quote-0', {
  itemId: 'p-0-0', providerId: 'provider', value: '1,00',
}, { expectedVersion: 1 });
const mutation = {
  rpc: calls.length - first.rpc, signingBatches: signs.length - first.signingBatches,
  signedPaths: signs.flat().length - first.signedPaths,
};
const beforeList = { rpc: calls.length, signs: signs.length, paths: signs.flat().length };
await api.listRecords('quotes');
const refreshedList = {
  rpc: calls.length - beforeList.rpc, signingBatches: signs.length - beforeList.signs,
  signedPaths: signs.flat().length - beforeList.paths,
};
await api.setContext(null);

let release;
const saved = [], gate = new Promise(resolve => { release = resolve; });
const queue = createAutosaveQueue(async payload => { saved.push(payload.value); await gate; }, 5);
for (let value = 1; value <= 4; value++) {
  queue.schedule('same-order', { value });
  await new Promise(resolve => setTimeout(resolve, 10));
}
const autosaveStartedBeforeFirstResponse = [...saved];
release();
await Promise.all(queue.flushAll());
queue.reset();
console.log(JSON.stringify({ fixture: { records: rows.length, items: 1000, remote: false },
  first, mutation, refreshedList, autosaveStartedBeforeFirstResponse }, null, 2));
