import { escapeHtml } from '../../shared/ui.js';

export function openProviderRemovalDialog({ host, provider, trigger, onRemove, onRemoved, onError }) {
  if (host.querySelector('.quote-remove-confirmation')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'quote-remove-confirmation';
  dialog.setAttribute('aria-labelledby', 'quote-remove-title');
  dialog.setAttribute('aria-describedby', 'quote-remove-description');
  dialog.innerHTML = `<h2 id="quote-remove-title">Remover fornecedor?</h2><p id="quote-remove-description">${escapeHtml(provider.name)} será removido desta cotação, junto com seus preços, rascunhos e escolhas. As informações dos outros fornecedores serão mantidas.</p><div><button type="button" class="button secondary cancel-remove">Cancelar</button><button type="button" class="button primary confirm-remove">Remover fornecedor</button></div>`;
  let closed = false,
    saving = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('hashchange', close);
    if (dialog.open) dialog.close();
    dialog.remove();
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  dialog.querySelector('.cancel-remove').onclick = close;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', close);
  dialog.querySelector('.confirm-remove').onclick = async (event) => {
    if (saving) return;
    saving = true;
    event.currentTarget.disabled = true;
    try {
      await onRemove();
      if (!host.isConnected) return;
      close();
      onRemoved();
    } catch (error) {
      close();
      if (host.isConnected) onError(error);
    }
  };
  window.addEventListener('hashchange', close, { once: true });
  host.append(dialog);
  dialog.showModal();
  dialog.querySelector('.cancel-remove').focus();
  return close;
}
