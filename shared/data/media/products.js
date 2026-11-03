import { canonicalAssets, legacyPhotos } from './validation.js';
import { createProductThumbnail } from './thumbnail.js';
import {
  PRODUCT_PHOTO_BUCKET,
  isSignedProductPhoto,
  legacyPhotoBlob,
} from '../../../interno/cadastros/produtos/photo.js';
export const PRODUCT_SIGNED_URL_SECONDS = 900;
export const PRODUCT_MEDIA_CACHE_MS = 600_000;
export function createProductMedia({
  supabase,
  rpc,
  queryClient,
  requireContext,
  ensureGeneration,
  invalidate,
  now,
  getGeneration,
}) {
  let mediaRefreshTimer = null,
    mediaRefreshAt = Infinity;
  const mediaRefreshDeadlines = new Map();
  const mediaKey = (company, row) => ['sp', company, 'product_media', String(row.id), row._version];
  function scheduleMediaRefresh(expiresAt, current, resource = 'products') {
    if (!Number.isFinite(expiresAt)) return;
    if (!mediaRefreshDeadlines.has(expiresAt)) mediaRefreshDeadlines.set(expiresAt, new Set());
    mediaRefreshDeadlines.get(expiresAt).add(resource);
    if (expiresAt >= mediaRefreshAt) return;
    clearTimeout(mediaRefreshTimer);
    mediaRefreshAt = expiresAt;
    mediaRefreshTimer = setTimeout(
      () => {
        mediaRefreshTimer = null;
        mediaRefreshAt = Infinity;
        const affected = new Set();
        for (const [deadline, resources] of mediaRefreshDeadlines) {
          if (deadline > now()) continue;
          for (const resource of resources) affected.add(resource);
          mediaRefreshDeadlines.delete(deadline);
        }
        // Photos loaded later keep their own renewal deadline. An earlier timer
        // must not discard it just because the later URLs are still cached.
        const next = Math.min(...mediaRefreshDeadlines.keys());
        if (Number.isFinite(next)) {
          const nextResource = mediaRefreshDeadlines.get(next).values().next().value;
          scheduleMediaRefresh(next, current, nextResource);
        }
        if (getGeneration() === current) for (const resource of affected) void invalidate(resource);
      },
      Math.max(1, expiresAt - now()),
    );
    mediaRefreshTimer?.unref?.();
  }
  async function resolveMediaBatch(mediaRows, company, current) {
    const canonical = mediaRows.map((row) => ({
      row,
      legacy: legacyPhotos(row.legacyPhotos ?? row.photos ?? []),
      assets: canonicalAssets(row.photoAssets ?? row.assets ?? [], company, row.id),
    }));
    const paths = [...new Set(canonical.flatMap((item) => item.assets.map((asset) => asset.path)))],
      signed = new Map();
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { data, error } = await supabase()
        .storage.from(PRODUCT_PHOTO_BUCKET)
        .createSignedUrls(batch, PRODUCT_SIGNED_URL_SECONDS);
      ensureGeneration(current);
      if (error || !Array.isArray(data))
        throw Error(error?.message || 'Não foi possível autorizar as fotos do catálogo.');
      for (const path of batch) {
        const item = data.find((item) => item.path === path),
          url = item?.signedUrl ?? item?.signedURL;
        if (item?.error || !isSignedProductPhoto(url, { path }))
          throw Error('Não foi possível autorizar todas as fotos do catálogo.');
        signed.set(path, url);
      }
    }
    ensureGeneration(current);
    for (const { row, legacy, assets } of canonical) {
      if (legacy.length + assets.length > 5) throw Error('O banco retornou mais de cinco fotos para um produto.');
      const entries = Array(legacy.length + assets.length);
      for (const asset of assets) {
        if (asset.position >= entries.length || entries[asset.position])
          throw Error('O banco retornou posições de fotos inválidas.');
        entries[asset.position] = { src: signed.get(asset.path), asset };
      }
      let nextLegacy = 0;
      for (let index = 0; index < entries.length; index++)
        if (!entries[index]) entries[index] = { src: legacy[nextLegacy++] };
      const expiresAt = assets.length ? now() + PRODUCT_MEDIA_CACHE_MS : Infinity;
      queryClient.setQueryData(row._mediaCacheKey ?? mediaKey(company, row), {
        legacyPhotos: legacy,
        photoAssets: assets,
        photoEntries: entries,
        expiresAt,
      });
      scheduleMediaRefresh(expiresAt, current, row._mediaResource ?? 'products');
    }
  }
  const productAliases = (row, media) => {
    if (!row) return row;
    const photos = media.photoEntries.map((entry) => entry.src);
    return {
      ...row,
      photos,
      legacyPhotos: media.legacyPhotos,
      photoAssets: media.photoAssets,
      photoEntries: media.photoEntries,
      photo: photos[0] ?? '',
      image: photos[0] ?? '',
    };
  };
  async function hydrateProductMedia(rows, company, current) {
    const missing = [],
      inline = [];
    for (const row of rows) {
      const cached = queryClient.getQueryData(mediaKey(company, row));
      if (cached?.expiresAt > now()) continue;
      if (Array.isArray(row.photos)) inline.push(row);
      else if (row.hasPhotos) missing.push(row);
      else inline.push({ ...row, photos: [], photoAssets: row.photoAssets ?? [] });
    }
    if (inline.length) await resolveMediaBatch(inline, company, current);
    const batches = [];
    for (let index = 0; index < missing.length; index += 4) batches.push(missing.slice(index, index + 4));
    let nextBatch = 0;
    const worker = async () => {
      while (nextBatch < batches.length) {
        const batch = batches[nextBatch++];
        const media = await rpc('sp_product_media', { p_company_id: company, p_ids: batch.map((row) => row.id) });
        ensureGeneration(current);
        if (!Array.isArray(media) || media.length !== batch.length)
          throw Error('Não foi possível carregar todas as fotos do catálogo.');
        for (const item of media) {
          const expected = batch.find((row) => row.id === item.id);
          if (!expected || item._version !== expected._version) {
            const error = Error('O catálogo foi alterado durante o carregamento.');
            error.code = 'CATALOG_CHANGED';
            throw error;
          }
        }
        await resolveMediaBatch(media, company, current);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, batches.length) }, worker));
    ensureGeneration(current);
    return rows.map((row) => productAliases(row, queryClient.getQueryData(mediaKey(company, row))));
  }
  function productWriteRecord(record) {
    const { photo, image, photoEntries, legacyPhotos: legacy, photos, hasPhotos, photoCount, ...saved } = record;
    if (legacy !== undefined) saved.photos = legacyPhotos(legacy);
    else if (photos !== undefined) saved.photos = legacyPhotos(photos);
    if (saved.photoAssets !== undefined)
      saved.photoAssets = canonicalAssets(saved.photoAssets, requireContext().companyId, record.id);
    return saved;
  }
  async function uploadProductPhoto(productId, source) {
    const company = requireContext().companyId,
      current = getGeneration();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(productId))) throw Error('Identificador de produto inválido.');
    const blob = legacyPhotoBlob(source),
      extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp';
    const path = `${company}/products/${productId}/${globalThis.crypto.randomUUID()}.${extension}`;
    const { error } = await supabase()
      .storage.from(PRODUCT_PHOTO_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '3600', upsert: false });
    if (error) throw Error(error.message || 'Não foi possível enviar a foto ao armazenamento.');
    ensureGeneration(current);
    return { bucket: PRODUCT_PHOTO_BUCKET, path, mimeType: blob.type, size: blob.size };
  }
  async function saveProductGallery(
    productId,
    { photoAssets = [], legacyPhotos: legacy = [] },
    { expectedVersion } = {},
  ) {
    const company = requireContext().companyId,
      current = getGeneration();
    const assets = canonicalAssets(photoAssets, company, productId);
    const legacyPictures = legacyPhotos(legacy);
    let thumbnail = null;
    // Prepare before committing: a decode/download failure cannot leave an unknown gallery version.
    if (globalThis.document?.createElement && globalThis.Image) {
      const primary = assets.find((asset) => asset.position === 0);
      if (primary) {
        const { data, error } = await supabase().storage.from(PRODUCT_PHOTO_BUCKET).download(primary.path);
        ensureGeneration(current);
        if (error) throw Error(error.message || 'Não foi possível preparar a foto principal.');
        thumbnail = await createProductThumbnail(data);
      } else if (legacyPictures.length) thumbnail = await createProductThumbnail(legacyPictures[0]);
      ensureGeneration(current);
    }
    let result = await rpc('sp_product_gallery', {
      p_company_id: company,
      p_product_id: String(productId),
      p_assets: assets,
      p_legacy_photos: legacyPictures,
      p_expected_version: expectedVersion ?? null,
    });
    ensureGeneration(current);
    if (thumbnail) {
      try {
        const confirmation = await rpc('sp_product_thumbnail_save', {
          p_company_id: company, p_id: String(productId),
          p_expected_version: result._version, p_preview: thumbnail,
        });
        ensureGeneration(current);
        result = { ...result, _version: confirmation._version };
      } catch (error) {
        // Gallery save succeeded. Preserve its version; the normal preview RPC can still show the original.
        ensureGeneration(current);
        console.warn('Galeria salva; a miniatura poderá ser preparada novamente.', error);
      }
    }
    await invalidate('products');
    ensureGeneration(current);
    return (await hydrateProductMedia([result], company, current))[0];
  }
  function resetMediaRefresh() {
    clearTimeout(mediaRefreshTimer);
    mediaRefreshTimer = null;
    mediaRefreshAt = Infinity;
    mediaRefreshDeadlines.clear();
  }
  return {
    hydrateProductMedia,
    resolveMediaBatch,
    productAliases,
    productWriteRecord,
    uploadProductPhoto,
    saveProductGallery,
    resetMediaRefresh,
  };
}
