import { productCategoryService } from "./services.js";
import { loadProductCategories } from "./queries.js";
export { productCategories, productSubcategories, loadProductCategories } from "./queries.js";
export async function saveProductCategory(input) {
  const saved = await productCategoryService.save(input);
  await loadProductCategories();
  return saved;
}
