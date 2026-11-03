import { supabaseConfig } from "../../../shared/data/config.js";
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_DIMENSION = 12000;
export function validatePhoto(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Escolha uma foto JPEG, PNG ou WebP.");
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error("Cada foto deve ter até 3 MB.");
  return true;
}
export const PRODUCT_PHOTO_BUCKET = "product-photos";
export const isLegacyPhotoData = (value) =>
  typeof value === "string" && /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value);
export function isSignedProductPhoto(value, { path } = {}) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value),
      origin = new URL(supabaseConfig.url).origin,
      prefix = `/storage/v1/object/sign/${PRODUCT_PHOTO_BUCKET}/`;
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.hash ||
      !url.pathname.startsWith(prefix) ||
      !url.searchParams.get("token")
    )
      return false;
    const objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
    if (
      !objectPath ||
      objectPath.split("/").some((part) => !part || part === "." || part === "..") ||
      /[\\\u0000-\u001f]/.test(objectPath)
    )
      return false;
    return path === undefined || objectPath === path;
  } catch {
    return false;
  }
}
export const isPhotoSource = (value) => !value || isLegacyPhotoData(value) || isSignedProductPhoto(value);
// Compatibility alias used by existing renderers. Persisted galleries still accept legacy data only.
export const isPhotoData = isPhotoSource;
export function legacyPhotoBlob(source) {
  if (!isLegacyPhotoData(source)) throw Error("A nova foto precisa ser uma imagem local válida.");
  const [header, encoded] = source.split(","),
    mimeType = header.slice(5, header.indexOf(";"));
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw Error("Cada foto deve ter até 3 MB.");
  return new Blob([bytes], { type: mimeType });
}
export function canonicalGallery(photos, entries = []) {
  validateGallery(photos);
  const legacyPhotos = [],
    photoAssets = [];
  photos.forEach((source, position) => {
    const previous = entries.find((entry) => entry.src === source);
    if (previous?.asset) {
      photoAssets.push({ ...previous.asset, position });
      return;
    }
    if (!isLegacyPhotoData(source)) throw Error("A referência desta foto expirou. Reabra o produto antes de salvar.");
    legacyPhotos.push(source);
  });
  return { legacyPhotos, photoAssets };
}
export function refreshGallerySources(photos, previousEntries = [], currentEntries = []) {
  const entries = [...currentEntries];
  const next = photos.map((source) => {
    const old = previousEntries.find((entry) => entry.src === source);
    if (!old?.asset) return source;
    const current = currentEntries.find(
      (entry) => entry.asset?.path === old.asset.path && entry.asset?.bucket === old.asset.bucket,
    );
    if (current) return current.src;
    if (!entries.some((entry) => entry.src === old.src)) entries.push(old);
    return source;
  });
  return { photos: next, photoEntries: entries };
}
export function validateDimensions(width, height) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_PHOTO_DIMENSION ||
    height > MAX_PHOTO_DIMENSION ||
    width * height > 40000000
  )
    throw new Error("A imagem deve ter até 12.000 pixels por lado e 40 megapixels.");
  return true;
}
export function validateGallery(photos) {
  if (!Array.isArray(photos) || photos.length > MAX_PHOTOS) throw new Error("Cada produto pode ter até 5 fotos.");
  if (
    photos.some(
      (p) =>
        typeof p !== "string" || !p || !isPhotoSource(p) || (isLegacyPhotoData(p) && p.length > MAX_PHOTO_BYTES * 1.4),
    )
  )
    throw new Error("Foto inválida.");
  return [...photos];
}
export async function readPhoto(file) {
  validatePhoto(file);
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("O arquivo não contém uma imagem válida."));
    image.src = data;
  });
  validateDimensions(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const optimized = canvas.toDataURL("image/webp", 0.86);
  return scale < 1 || optimized.length < data.length ? optimized : data;
}
export async function readPhotoBatch(files, existing = [], reader = readPhoto) {
  validateGallery(existing);
  const chosen = Array.from(files);
  if (existing.length + chosen.length > MAX_PHOTOS)
    throw new Error("Cada produto pode ter até 5 fotos. Selecione menos arquivos.");
  chosen.forEach(validatePhoto);
  const additions = [];
  for (const file of chosen) additions.push(await reader(file));
  return validateGallery([...existing, ...additions]);
}
export function movePhoto(photos, from, to) {
  const next = validateGallery(photos);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= next.length ||
    to >= next.length
  )
    throw new Error("Posição de foto inválida.");
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

// An artwork copies the approved pixels so its saved snapshot survives URL expiry.
// Product metadata and gallery edits must keep Storage references instead.
export async function materializeProductPhoto(source, { fetcher = fetch } = {}) {
  if (!source || isLegacyPhotoData(source)) return source || "";
  if (!isSignedProductPhoto(source)) throw Error("A foto não pertence ao armazenamento autorizado.");
  const response = await fetcher(source, { mode: "cors", credentials: "omit", redirect: "error" });
  if (!response.ok)
    throw Error("Não foi possível copiar a foto do produto para o documento. Reabra o catálogo e tente novamente.");
  const blob = await response.blob();
  if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type) || !blob.size || blob.size > 8 * 1024 * 1024)
    throw Error("A foto do produto tem um formato ou tamanho inválido para o documento.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
