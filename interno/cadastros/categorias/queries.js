import { replaceRows } from "../remote.js";
import { productCategoryService } from "./services.js";
import { resetCategoryContext } from "./realtime.js";
export const productCategories = [],
  productSubcategories = [];
export async function loadProductCategories() {
  const rows = await productCategoryService.list();
  replaceRows(
    productCategories,
    rows.filter((row) => !row.parentId),
  );
  replaceRows(
    productSubcategories,
    rows.filter((row) => row.parentId),
  );
  return productCategories;
}
resetCategoryContext(() => {
  productCategories.splice(0);
  productSubcategories.splice(0);
});
