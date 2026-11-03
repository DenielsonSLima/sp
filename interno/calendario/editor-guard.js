/** Keep the original form mounted so invalid and unfinished input survives dismissal. */
export function createEditorCloseGuard({
  form,
  host,
  onClose,
  readSnapshot = () => JSON.stringify([...new FormData(form)]),
}) {
  const initialSnapshot = readSnapshot(),
    document = form.ownerDocument;
  let confirmation = null,
    closed = false;
  const dirty = () =>
    readSnapshot() !== initialSnapshot || [...form.elements].some((control) => control.validity?.badInput);
  const clearConfirmation = () => {
    if (!confirmation) return;
    const current = confirmation;
    confirmation = null;
    current.close();
    current.remove();
  };
  const finish = () => {
    if (closed) return;
    closed = true;
    clearConfirmation();
    onClose();
  };
  function requestClose() {
    if (closed || confirmation) return;
    if (!dirty()) {
      finish();
      return;
    }
    const previousFocus = document.activeElement;
    confirmation = document.createElement("dialog");
    confirmation.className = "calendar-dialog calendar-confirm calendar-discard";
    confirmation.setAttribute("aria-labelledby", "calendar-discard-title");
    confirmation.setAttribute("aria-describedby", "calendar-discard-description");
    confirmation.innerHTML =
      '<h2 id="calendar-discard-title">Descartar alterações?</h2><p id="calendar-discard-description">As alterações ainda não foram salvas. Você pode continuar editando sem perder o que preencheu.</p><div class="calendar-dialog-actions"><button class="button secondary" type="button" data-keep autofocus>Continuar editando</button><button class="button primary" type="button" data-discard>Descartar</button></div>';
    const keep = () => {
      clearConfirmation();
      if (previousFocus?.isConnected) previousFocus.focus();
      else form.querySelector("[name=title]")?.focus();
    };
    confirmation.querySelector("[data-keep]").onclick = keep;
    confirmation.querySelector("[data-discard]").onclick = finish;
    confirmation.addEventListener("cancel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      keep();
    });
    host.append(confirmation);
    confirmation.showModal();
    confirmation.querySelector("[data-keep]").focus();
  }
  return {
    requestClose,
    dispose() {
      closed = true;
      clearConfirmation();
    },
  };
}
