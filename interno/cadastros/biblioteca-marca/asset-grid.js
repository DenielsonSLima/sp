import { escapeHtml as esc } from "../../../shared/ui.js";

export const assetMetadata = ({ id, name, category, width, height, mimeType, hasPreview, _version }) =>
  ({ id, name, category, width, height, mimeType, hasPreview, _version });

/** Preserve image nodes for unaffected cards when a single PNG changes or disappears. */
export function reconcileAssetGrid(grid, rows) {
  const previous = new Map([...grid.querySelectorAll("[data-asset-id]")].map((node) => [node.dataset.assetId, node]));
  grid.querySelector(".brand-empty")?.remove();
  for (const asset of rows) {
    let node = previous.get(asset.id);
    const signature = JSON.stringify(assetMetadata(asset));
    previous.delete(asset.id);
    if (!node || node.dataset.signature !== signature) {
      const next = document.createElement("article");
      next.className = "card brand-card";
      next.dataset.assetId = asset.id;
      next.dataset.signature = signature;
      next.innerHTML = `<div class="brand-preview"><img data-brand-preview="${esc(asset.id)}" alt="${esc(asset.name)}" loading="lazy"></div><div class="brand-card-body"><h3>${esc(asset.name)}</h3><p>${esc(asset.category)} · ${asset.width} × ${asset.height} px</p><div><button class="button secondary brand-download" data-id="${esc(asset.id)}" aria-label="Baixar ${esc(asset.name)}">Baixar PNG</button><button class="button secondary brand-edit" data-id="${esc(asset.id)}" aria-label="Editar ${esc(asset.name)}">Editar</button><button class="button secondary brand-delete" data-id="${esc(asset.id)}" aria-label="Excluir ${esc(asset.name)}">Excluir</button></div></div>`;
      node?.replaceWith(next);
      node = next;
    }
    grid.append(node);
  }
  for (const node of previous.values()) node.remove();
  if (!rows.length) grid.innerHTML = '<div class="card brand-empty"><h3>Nenhum elemento encontrado</h3><p>Adicione PNGs na biblioteca ou ajuste os filtros.</p></div>';
}
