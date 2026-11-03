import { productQueries } from "../queries.js";
import { createProductPreviewLoader } from "./use-product-previews.js";

/** Metadata requests and the displayed page have independent lifetimes. */
export function useProductPage({
  queries = productQueries,
  root,
  isCurrent = () => true,
  createPreviewLoader = createProductPreviewLoader,
} = {}) {
  let generation = 0;
  let previewGeneration = 0;
  let presentation = null;
  return {
    invalidate() {
      generation++;
      previewGeneration++;
      presentation?.loader.dispose();
      presentation = null;
    },
    async load(filters) {
      const token = ++generation;
      const slice = await queries.page(filters);
      return { slice, isCurrent: () => token === generation && isCurrent() };
    },
    previews: (rows, options) => queries.previews(rows, options),
    refreshPreviews(signature, rows, { onBatch = () => {}, onError = () => {} } = {}) {
      // Repeated metadata refreshes retain observers and in-flight preview work.
      // Refresh also retries failed images and renews expired signed URLs.
      if (presentation?.signature === signature) return presentation.loader.refresh();
      presentation?.loader.dispose();
      const token = ++previewGeneration;
      const current = () => token === previewGeneration && isCurrent();
      const loader = createPreviewLoader({
        root,
        load: (batch, options) => queries.previews(batch, options),
        isCurrent: current,
        onBatch: (batch) => { if (current()) onBatch(batch); },
        onError: (error, batch) => { if (current()) onError(error, batch); },
      });
      presentation = { signature, loader };
      return loader.observe(rows);
    },
  };
}
