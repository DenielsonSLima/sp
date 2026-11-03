// Native modal dialog provides top-layer isolation, background inertness and
// keyboard focus containment. Only the explicit Sair button returns true.
export const logoutMarkup = `<div class="logout-confirmation-content"><span class="logout-confirmation-icon" aria-hidden="true">↗</span><h2 id="logout-confirmation-title">Deseja realmente sair?</h2><p id="logout-confirmation-description">Você voltará para a tela de entrada.</p><div class="logout-confirmation-actions"><button type="button" class="button secondary" data-action="cancel" autofocus>Cancelar</button><button type="button" class="button primary" data-action="confirm">Sair</button></div></div>`;
export function confirmLogout({ host = document.body, signal } = {}) {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'logout-confirmation';
    dialog.setAttribute('aria-labelledby', 'logout-confirmation-title');
    dialog.setAttribute('aria-describedby', 'logout-confirmation-description');
    dialog.innerHTML = logoutMarkup;
    const previousOverflow = document.body.style.overflow;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (dialog.open) dialog.close();
      dialog.remove();
      document.body.style.overflow = previousOverflow;
      resolve(result);
    };
    const abort = () => finish(false);
    dialog.querySelector('[data-action="cancel"]').onclick = () => finish(false);
    dialog.querySelector('[data-action="confirm"]').onclick = () => finish(true);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    });
    dialog.addEventListener('close', () => finish(false));
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
        finish(false);
    });
    signal?.addEventListener('abort', abort, { once: true });
    host.append(dialog);
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector('[data-action="cancel"]').focus();
  });
}
