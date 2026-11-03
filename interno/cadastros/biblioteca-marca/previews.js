import { getAssetPreview } from "./services.js";
import { getDataContext, subscribeResource } from "../../../shared/data/api.js";

/** Load only visible PNGs, four at a time. Folder navigation needs metadata only. */
export function mountAssetPreviews(root, assets, { isCurrent = () => true, onError = () => {}, read = getAssetPreview } = {}) {
  let active = true,
    running = 0,
    lifecycleObserver,
    observer,
    unsubscribe;
  const queue = [];
  const scope = () => {
    const context = getDataContext();
    return JSON.stringify([context?.companyId, context?.user?.id]);
  };
  const initialScope = scope();
  const current = () => active && root.isConnected && isCurrent() && scope() === initialScope;
  const cleanup = () => {
    if (!active) return;
    active = false;
    queue.length = 0;
    observer?.disconnect();
    lifecycleObserver?.disconnect();
    unsubscribe?.();
  };
  const pump = () => {
    if (!current()) {
      cleanup();
      return;
    }
    while (current() && running < 4 && queue.length) {
      const image = queue.shift(),
        asset = assets.find((asset) => asset.id === image.dataset.brandPreview);
      if (!asset || !image.isConnected) continue;
      running++;
      read(asset.id, asset._version)
        .then((full) => {
          if (current() && image.isConnected) image.src = full.dataURL;
        })
        .catch((error) => {
          if (current()) onError(error);
        })
        .finally(() => {
          running--;
          pump();
        });
    }
  };
  observer = new IntersectionObserver((entries) => {
    if (!current()) {
      cleanup();
      return;
    }
    for (const entry of entries)
      if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        queue.push(entry.target);
      }
    pump();
  }, { rootMargin: "180px 0px" });
  unsubscribe = subscribeResource("brand_assets", () => {
    if (!getDataContext() || !current()) cleanup();
  });
  if (globalThis.MutationObserver && globalThis.document?.body) {
    lifecycleObserver = new MutationObserver(() => {
      if (!current()) cleanup();
    });
    lifecycleObserver.observe(document.body, { childList: true, subtree: true });
  }
  root.querySelectorAll("[data-brand-preview]").forEach((image) => {
    if (!image.getAttribute?.("src")) observer.observe(image);
  });
  return cleanup;
}
