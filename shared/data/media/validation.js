import { PRODUCT_PHOTO_BUCKET, isLegacyPhotoData } from '../../../interno/cadastros/produtos/photo.js';
export function canonicalAssets(assets, company, productId) {
  if (!Array.isArray(assets)) throw Error('O banco retornou referências de fotos inválidas.');
  return assets.map((asset) => {
    const prefix = `${company}/products/${productId}/`,
      name = String(asset?.path ?? '').slice(prefix.length);
    if (
      asset?.bucket !== PRODUCT_PHOTO_BUCKET ||
      !String(asset.path).startsWith(prefix) ||
      !name ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|webp)$/i.test(name) ||
      name.includes('..') ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 1 ||
      asset.size > 8 * 1024 * 1024 ||
      !Number.isInteger(asset.position) ||
      asset.position < 0 ||
      asset.position > 4
    )
      throw Error('A referência da foto não pertence ao produto autorizado.');
    return Object.fromEntries(
      ['id', 'bucket', 'path', 'mimeType', 'size', 'width', 'height', 'angle', 'position', 'source']
        .filter((key) => asset[key] !== undefined)
        .map((key) => [key, asset[key]]),
    );
  });
}
export function legacyPhotos(value) {
  if (!Array.isArray(value) || value.some((photo) => !isLegacyPhotoData(photo)))
    throw Error('A galeria legada retornada pelo banco é inválida.');
  return [...value];
}
