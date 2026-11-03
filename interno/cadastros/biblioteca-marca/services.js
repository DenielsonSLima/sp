import { listRecords, saveRecord, deleteRecord, updateBrandAssetMetadata } from "../../../shared/data/api.js";
import { clearOnContextChange } from "./realtime.js";
import { UNCATEGORIZED } from "./state.js";
import { getRecord, getDataContext, getBrandAssetPreview } from "../../../shared/data/api.js";

import { createAssetThumbnail } from "./thumbnail.js";

// Keep the viewed version and the company together across metadata → PNG → write.
export function createBrandAssetStorage({
  read = listRecords,
  readOne = getRecord,
  write = saveRecord,
  updateMetadata = updateBrandAssetMetadata,
  remove = deleteRecord,
  context = getDataContext,
  onContextChange = clearOnContextChange,
} = {}) {
  const versions = new Map();
  let revision = 0;
  const scope = () => {
    const value = context();
    return JSON.stringify([value?.companyId, value?.user?.id]);
  };
  const capture = () => ({ scope: scope(), revision });
  const check = (stamp) => {
    if (stamp.scope !== scope() || stamp.revision !== revision)
      throw Error("A sessão ou empresa mudou. Abra a biblioteca novamente.");
  };
  const unsubscribe = onContextChange("brand_assets", () => {
    revision++;
    versions.clear();
  });
  const getAsset = async (id, expectedVersion) => {
    const stamp = capture(),
      row = await readOne("brand_assets", id);
    check(stamp);
    if (!row) throw Error("O PNG não está mais disponível.");
    if (expectedVersion !== undefined && row._version !== expectedVersion)
      throw Error("A biblioteca mudou. Atualize a pasta antes de escolher o PNG.");
    return row;
  };
  return {
    async listAssets() {
      const stamp = capture(),
        rows = await read("brand_assets");
      check(stamp);
      versions.clear();
      rows.forEach((row) => versions.set(row.id, row._version));
      return rows;
    },
    getAsset,
    deleteAsset(id, expectedVersion = versions.get(id)) {
      if (expectedVersion == null) throw Error("Atualize a biblioteca antes de excluir o PNG.");
      return remove("brand_assets", id, { expectedVersion });
    },
    async updateAsset(value) {
      const stamp = capture(),
        expectedVersion = value._version ?? versions.get(value.id);
      if (expectedVersion == null) throw Error("Atualize a biblioteca antes de editar o PNG.");
      check(stamp);
      const saved = value.dataURL
        ? await write("brand_assets", value, { expectedVersion })
        : await updateMetadata(value.id, { name: value.name, category: value.category, _version: expectedVersion });
      check(stamp);
      versions.set(saved.id, saved._version);
      return saved;
    },
    dispose() {
      revision++;
      versions.clear();
      unsubscribe?.();
    },
  };
}
export const brandAssetStorage = createBrandAssetStorage();
export const { getAsset, updateAsset, deleteAsset } = brandAssetStorage;
export const listBrandCategories = () => listRecords("brand_categories");
export const addAsset = async (value) => {
  const context = getDataContext();
  const previewDataURL = await createAssetThumbnail(value.dataURL);
  const current = getDataContext();
  if (!current || current.companyId !== context?.companyId || current.user?.id !== context?.user?.id)
    throw Error("A sessão ou empresa mudou. Abra a biblioteca novamente.");
  return saveRecord("brand_assets", { ...value, previewDataURL });
};
export async function getAssetPreview(id, expectedVersion) {
  const preview = await getBrandAssetPreview(id, expectedVersion);
  // Only older records without a derived preview use the original; RPC errors stay visible.
  return preview.dataURL ? preview : getAsset(id, expectedVersion);
}
const changeCategory = async (action, source, target) => {
  const row = await saveRecord("brand_categories", { action, source, target, name: target ?? source });
  return row.name;
};
export const addCategory = (name) => changeCategory("add", null, name);
export const renameCategory = (oldName, newName) => changeCategory("rename", oldName, newName);
export const removeCategory = (name, reassignTo = UNCATEGORIZED) => changeCategory("remove", name, reassignTo);
