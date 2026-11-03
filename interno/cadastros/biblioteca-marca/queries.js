import { brandAssetStorage, listBrandCategories } from "./services.js";
export const listAssets = () => brandAssetStorage.listAssets();
export async function listCategories() {
  return (await listBrandCategories()).map((row) => row.name).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
