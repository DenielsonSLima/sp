import { resourceError } from '../remote.js';
import { loadButcherModels, listModels } from './state.js';
import { modelIdFromHash } from './presentation.js';
import { renderList } from './views/list.js';
import { renderDetail } from './views/detail.js';
export async function render(root) {
  try {
    await loadButcherModels();
    if (!root.isConnected) return;
    const id = modelIdFromHash(location.hash);
    if (id) {
      const model = listModels().find((row) => row.id === id);
      if (!model) throw Error('Modelo não encontrado. Volte para Cadastros → Açougue.');
      return await renderDetail(root, model);
    }
    renderList(root);
  } catch (error) { resourceError(root, error); }
}
