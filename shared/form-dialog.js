import { subscribeResource, getDataContext } from './data/api.js';
let nextId = 0;
// Keeps existing form handlers and RPC contracts; only controls its presentation.
export function bindFormDialog(
  form,
  {
    host = form.parentElement,
    title = 'Cadastro',
    resource = '',
    cancelSelector = '',
    onCancel,
    errorSource = null,
    wide = false,
  } = {},
) {
  const dialog = document.createElement('dialog');
  dialog.className = `form-dialog${wide ? ' form-dialog-wide' : ''}`;
  const header = document.createElement('header'),
    label = document.createElement('h2'),
    closeButton = document.createElement('button');
  header.className = 'form-dialog-heading';
  label.id = `form-dialog-title-${++nextId}`;
  label.textContent = title;
  closeButton.type = 'button';
  closeButton.className = 'form-dialog-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Fechar formulário');
  header.append(label, closeButton);
  dialog.setAttribute('aria-labelledby', label.id);
  const originalHeading = form.querySelector('h2,h3');
  originalHeading?.classList.add('form-dialog-original-heading');
  const error = document.createElement('p');
  error.className = 'form-dialog-error';
  error.setAttribute('role', 'alert');
  form.append(error);
  form.hidden = true;
  dialog.append(header, form);
  host.append(dialog);
  let trigger = null,
    overflow = '',
    locked = false,
    disposed = false;
  const unlock = () => {
    if (locked) {
      document.body.style.overflow = overflow;
      locked = false;
    }
  };
  const close = () => {
    form.hidden = true;
    if (dialog.open) dialog.close();
    unlock();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  };
  const requestCancel = () => {
    if (form.querySelector('[type=submit]:disabled')) return;
    if (onCancel) onCancel();
    else if (cancelSelector) form.querySelector(cancelSelector)?.click();
    else close();
  };
  if (!cancelSelector && !onCancel) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button secondary form-dialog-cancel';
    cancel.textContent = 'Cancelar';
    cancel.onclick = requestCancel;
    form.append(cancel);
  }
  closeButton.onclick = requestCancel;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestCancel();
  });
  dialog.addEventListener('close', () => {
    form.hidden = true;
    unlock();
  });
  const onNavigation = () => dispose();
  const observer = new MutationObserver(() => {
    if (!form.isConnected || !host.isConnected) dispose();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const errors = errorSource
    ? new MutationObserver(() => {
        if (dialog.open) error.textContent = errorSource.textContent;
      })
    : null;
  errors?.observe(errorSource, { childList: true, characterData: true, subtree: true });
  const stop = resource
    ? subscribeResource(resource, () => {
        if (!getDataContext()) dispose();
      })
    : () => {};
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    errors?.disconnect();
    stop();
    window.removeEventListener('hashchange', onNavigation);
    if (dialog.open) dialog.close();
    unlock();
    dialog.remove();
  };
  window.addEventListener('hashchange', onNavigation);
  return {
    dialog,
    open() {
      if (disposed) return;
      trigger = document.activeElement;
      label.textContent = originalHeading?.textContent || title;
      error.textContent = '';
      form.hidden = false;
      if (!dialog.open) {
        overflow = document.body.style.overflow;
        locked = true;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
      }
      (
        form.querySelector('[autofocus],input:not([type=hidden]):not([disabled]),textarea,select:not([disabled])') ||
        closeButton
      ).focus();
    },
    close,
    error(message) {
      error.textContent = message;
    },
    dispose,
  };
}
