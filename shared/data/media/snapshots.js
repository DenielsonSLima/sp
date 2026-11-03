import { canonicalAssets } from './validation.js';
import { isLegacyPhotoData, isSignedProductPhoto } from '../../../interno/cadastros/produtos/photo.js';
const clone = (value) => structuredClone(value);
export function createSnapshotMedia({ queryClient, ensureGeneration, now, resolveMediaBatch }) {
  async function hydrateSnapshotMedia(resource, records, company, current) {
    const copy = clone(records),
      nodes = [],
      missing = new Map();
    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value.photoAssets) && value.photoAssets.length) {
        const productId = value.productId ?? value.id;
        if (typeof productId !== 'string') throw Error('O documento retornou uma foto sem referência de produto.');
        const assets = canonicalAssets(value.photoAssets, company, productId),
          legacy = value.legacyPhotos ?? (isLegacyPhotoData(value.photo) ? [value.photo] : []);
        const key = ['sp', company, 'snapshot_media', resource, productId, JSON.stringify(assets)];
        const cached = queryClient.getQueryData(key);
        nodes.push({ node: value, key });
        if (!cached || cached.expiresAt <= now())
          missing.set(JSON.stringify(key), {
            id: productId,
            _version: 'snapshot',
            photos: legacy,
            photoAssets: assets,
            _mediaCacheKey: key,
            _mediaResource: resource,
          });
      }
      for (const [key, child] of Object.entries(value))
        if (!['photoAssets', 'photoEntries'].includes(key)) visit(child);
    };
    visit(copy);
    if (missing.size) await resolveMediaBatch([...missing.values()], company, current);
    ensureGeneration(current);
    for (const { node, key } of nodes) {
      const media = queryClient.getQueryData(key);
      Object.assign(node, {
        photos: media.photoEntries.map((entry) => entry.src),
        legacyPhotos: media.legacyPhotos,
        photoEntries: media.photoEntries,
        photo: media.photoEntries[0]?.src ?? '',
        image: media.photoEntries[0]?.src ?? '',
      });
    }
    return copy;
  }
  function snapshotWritePayload(value) {
    if (Array.isArray(value)) return value.map(snapshotWritePayload);
    if (!value || typeof value !== 'object') return value;
    const copy = {};
    for (const [key, child] of Object.entries(value)) {
      if (['photoEntries', 'legacyPhotos'].includes(key)) continue;
      if (['photo', 'image'].includes(key) && isSignedProductPhoto(child)) {
        copy[key] = value.legacyPhotos?.[0] ?? '';
        continue;
      }
      if (key === 'photos' && Array.isArray(child)) {
        copy[key] = value.legacyPhotos ?? child.filter(isLegacyPhotoData);
        continue;
      }
      copy[key] = snapshotWritePayload(child);
    }
    return copy;
  }

  return { hydrateSnapshotMedia, snapshotWritePayload };
}
