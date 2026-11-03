import { listRecords } from '../../shared/data/api.js';
import { clearOnContextChange } from '../cadastros/remote.js';
export const layerAssets = [];
export async function loadLayerAssets() {
  const rows = await listRecords('flyer_assets');
  if (
    rows.some(
      (row) =>
        typeof row.id !== 'string' ||
        typeof row.label !== 'string' ||
        !/^\.\/assets\/encartes\/camadas\/[a-z0-9-]+\.png$/.test(row.src) ||
        !Number.isFinite(row.width) ||
        !Number.isFinite(row.height) ||
        row.width <= 0 ||
        row.height <= 0 ||
        !['background', 'sticker'].includes(row.kind),
    )
  )
    throw Error('O banco retornou recursos gráficos incompletos.');
  layerAssets.splice(0, layerAssets.length, ...rows);
  return layerAssets;
}
clearOnContextChange('flyer_assets', () => {
  layerAssets.length = 0;
});
