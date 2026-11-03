import { renderEditor } from '../encartes/editor.js';
import { editorState, openDesign } from '../encartes/editor-state.js';
import { createDesign } from '../encartes/model.js';
import { persist, runtime } from '../encartes/editor/autosave.js';

// Keep the existing artwork library, drafts and editor in the gallery.
export async function render(root) {
  if (editorState.design.publication) {
    clearTimeout(runtime.saveTimer);
    const saved = await persist();
    if (!root.isConnected) return;
    // A failed save keeps the current page accessible for an explicit retry.
    if (saved) {
      const blank = createDesign();
      blank.bgColor = '#ffffff';
      openDesign(blank);
      editorState.tab = 'gallery';
      editorState.saveMessage = 'Nova arte';
    }
  }
  await renderEditor(root);
}
