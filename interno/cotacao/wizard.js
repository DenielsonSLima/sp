import { renderList } from './list.js';
import { openQuoteCreateDialog } from './create-dialog.js';

// Preserve direct links while creation takes place in the fullscreen dialog.
export async function renderWizard(root) {
  await renderList(root);
  if (root.isConnected)
    openQuoteCreateDialog({
      host: root,
      onCancel: () => {
        location.hash = 'cotacao';
      },
    });
}
