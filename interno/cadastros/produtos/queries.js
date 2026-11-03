import { productRepository } from "./services.js";
import { normalizeProductList } from "./navigation.js";

// These reads reuse the one QueryClient owned by shared/data/api.js.
// Canonical route defaults also keep equivalent filter states on the same key.
export const productQueries = {
  page: (filters) => productRepository.listProductPage(normalizeProductList(filters)),
  detail: (id) => productRepository.getProduct(id),
  previews: (rows, options) => productRepository.loadProductPreviews(rows, options),
};
export const loadProductDetail = productQueries.detail;
