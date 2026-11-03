import {
  calculate,
  uploadProductPhoto,
  saveProductGallery,
  getRecord,
  listProductMetadata,
  listProductPage,
  loadProductPreviews,
  listRecords,
  saveRecord,
} from "../../../shared/data/api.js";
import { loadUnits } from "../unidades/state.js";
import { canonicalGallery, isLegacyPhotoData, validateGallery } from "./photo.js";

const metadata = (record) => {
  const { photos, legacyPhotos, photoAssets, photoEntries, photo, image, hasPhotos, photoCount, ...fields } = record;
  return fields;
};
const galleryKey = (gallery) =>
  JSON.stringify({
    legacyPhotos: gallery.legacyPhotos,
    photoAssets: [...gallery.photoAssets].sort((a, b) => a.position - b.position),
  });
export function createRemoteProductRepository({
  read = listRecords,
  readOne = getRecord,
  metadataRead = listProductMetadata,
  pageRead = listProductPage,
  previewRead = loadProductPreviews,
  write = saveRecord,
  hydrateUnits = loadUnits,
  compute = calculate,
  upload = uploadProductPhoto,
  writeGallery = saveProductGallery,
} = {}) {
  const persist = async (input, current = null) => {
    const hasSelection = Object.hasOwn(input, "photos"),
      sources = hasSelection ? validateGallery(input.photos) : (current?.photos ?? []);
    const entries = [...(input.photoEntries ?? current?.photoEntries ?? [])];
    if (hasSelection) canonicalGallery(sources, entries);
    const legacy = current?.legacyPhotos ?? (current?.photos ?? []).filter(isLegacyPhotoData);
    const previous = canonicalGallery(current?.photos ?? [], current?.photoEntries ?? []);
    let saved = null;
    try {
      if (!current) saved = await write("products", metadata(input));
      const productId = current?.id ?? saved?.id;
      const desired = { legacyPhotos: [], photoAssets: [] };
      if (hasSelection)
        for (let position = 0; position < sources.length; position++) {
          const source = sources[position],
            known = entries.find((entry) => entry.src === source && entry.asset);
          if (known) {
            desired.photoAssets.push({ ...known.asset, position });
            continue;
          }
          if (legacy.includes(source)) {
            desired.legacyPhotos.push(source);
            continue;
          }
          const asset = { ...(await upload(productId, source)), position };
          entries.push({ src: source, asset });
          desired.photoAssets.push(asset);
        }
      if (current)
        saved = await write(
          "products",
          { ...metadata(current), ...metadata(input), id: current.id },
          { expectedVersion: input._version ?? current._version },
        );
      if (hasSelection && galleryKey(desired) !== galleryKey(previous))
        saved = await writeGallery(productId, desired, { expectedVersion: saved._version });
      return saved;
    } catch (error) {
      if (saved) {
        error.savedProduct = saved;
        error.message = `${error.message} Os dados do produto foram salvos; a galeria ainda precisa ser confirmada.`;
      }
      error.pendingPhotoEntries = entries;
      throw error;
    }
  };
  return {
    mode: "supabase",
    async listProducts() {
      await hydrateUnits();
      return read("products");
    },
    async getProduct(id) {
      await hydrateUnits();
      return readOne("products", id);
    },
    listProductMetadata() {
      return metadataRead();
    },
    listProductPage(filters) {
      return pageRead(filters);
    },
    loadProductPreviews(rows, options) {
      return previewRead(rows, options);
    },
    createProduct(input) {
      return persist(input);
    },
    async updateProduct(id, input) {
      const current = await this.getProduct(id);
      if (!current) throw Error("Produto não encontrado.");
      return persist(input, current);
    },
    updateProductPhotos(id, photos) {
      return this.updateProduct(id, { photos });
    },
    updateProductPhoto(id, photo) {
      return this.updateProductPhotos(id, photo ? [photo] : []);
    },
    async summary() {
      const result = await compute("home_summary");
      return { products: result.products };
    },
  };
}

export const productRepository = createRemoteProductRepository();
