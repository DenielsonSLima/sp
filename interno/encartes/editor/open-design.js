import { getDesign } from '../storage.js';
import { persist, runtime, sessionKey } from './autosave.js';

/** Finish the previous snapshot before adopting a remote document's edit version. */
export async function prepareEditorDesign(root, initialDesign, {
  flush = persist, read = getDesign, currentScope = sessionKey, editorRuntime = runtime,
} = {}) {
  const scope = currentScope();
  clearTimeout(editorRuntime.saveTimer);
  if (!(await flush())) throw Error('Salve a arte em edição antes de abrir outra página.');
  const ensure = () => {
    if (!root.isConnected || currentScope() !== scope)
      throw Error('A tela ou a sessão mudou. Abra o editor novamente.');
  };
  ensure();
  const design = initialDesign._version ? await read(initialDesign.id) : initialDesign;
  ensure();
  return design;
}
