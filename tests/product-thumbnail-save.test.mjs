import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductMedia } from '../shared/data/media/products.js';
import { createProductThumbnail } from '../shared/data/media/thumbnail.js';

const original = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmxkAAAAASUVORK5CYII=';
const preview = original.replace('CAQAAAC1', 'CAQAAAC2');
function browser(t, { decodeError, large = false } = {}) {
  const previous = { document: globalThis.document, Image: globalThis.Image };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {} }),
    toDataURL() { return large && this.width > 192 ? 'A'.repeat(300000) : preview; },
  };
  globalThis.document = { createElement: () => canvas };
  globalThis.Image = class {
    naturalWidth = 2000; naturalHeight = 1000;
    async decode() { if (decodeError) throw Error('Imagem inválida'); }
  };
  t.after(() => Object.assign(globalThis, previous));
  return canvas;
}
function media({ rejectPreview = false } = {}) {
  const calls = [], cache = new Map();
  const result = createProductMedia({
    supabase: () => { throw Error('Nenhuma leitura de Storage para foto legada'); },
    requireContext: () => ({ companyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    getGeneration: () => 1, ensureGeneration() {}, now: Date.now, async invalidate() {},
    queryClient: {
      getQueryData: key => cache.get(JSON.stringify(key)),
      setQueryData: (key, value) => cache.set(JSON.stringify(key), value),
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'sp_product_gallery') return { id: 'coffee', _version: 7, photos: [original], photoAssets: [] };
      if (name === 'sp_product_thumbnail_save') {
        if (rejectPreview) throw Error('Conflito de versão');
        return { id: 'coffee', _version: 8 };
      }
      throw Error('RPC inesperada: ' + name);
    },
  });
  return { result, calls };
}
test('gallery saves original and commits derivative against the returned version', async t => {
  const canvas = browser(t), { result, calls } = media();
  const saved = await result.saveProductGallery('coffee', { legacyPhotos: [original] }, { expectedVersion: 6 });
  assert.equal(calls[0].args.p_expected_version, 6);
  assert.deepEqual(calls[0].args.p_legacy_photos, [original]);
  assert.equal(calls[1].name, 'sp_product_thumbnail_save');
  assert.equal(calls[1].args.p_expected_version, 7);
  assert.equal(calls[1].args.p_preview, preview);
  assert.equal(saved._version, 8);
  assert.equal(saved.photos[0], original);
  assert.equal(canvas.width, 256); assert.equal(canvas.height, 128);
});
test('invalid image fails before gallery write', async t => {
  browser(t, { decodeError: true }); const { result, calls } = media();
  await assert.rejects(result.saveProductGallery('coffee', { legacyPhotos: [original] }, { expectedVersion: 6 }), /Imagem inválida/);
  assert.equal(calls.length, 0);
});
test('derivative conflict keeps confirmed gallery version and originals', async t => {
  browser(t); const { result } = media({ rejectPreview: true });
  const warn = console.warn; console.warn = () => {}; t.after(() => { console.warn = warn; });
  const saved = await result.saveProductGallery('coffee', { legacyPhotos: [original] }, { expectedVersion: 6 });
  assert.equal(saved._version, 7); assert.equal(saved.photos[0], original);
});
test('high detail thumbnail falls back to 192 pixels while preserving aspect ratio', async t => {
  const canvas = browser(t, { large: true });
  assert.equal(await createProductThumbnail(original), preview);
  assert.equal(canvas.width, 192); assert.equal(canvas.height, 96);
});
