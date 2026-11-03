import { escapeHtml } from '../../shared/ui.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { createQuote, today } from './state.js';
let draftState = null;
clearOnContextChange('quotes', () => {
  draftState = null;
});

export function openQuoteCreateDialog({
  host,
  trigger,
  onCancel = () => {},
  save = createQuote,
  onSaved = (quote) => {
    location.hash = 'cotacao/' + quote.id;
  },
}) {
  const existing = host.querySelector('.quote-create-dialog');
  if (existing) return existing;
  draftState ??= { title: '', date: today(), notes: '' };
  const draft = draftState;
  const dialog = document.createElement('dialog'),
    events = new AbortController();
  const previousOverflow = document.body.style.overflow;
  let settled = false,
    saving = false;
  dialog.className = 'quote-create-dialog';
  dialog.setAttribute('aria-labelledby', 'quote-create-title');
  dialog.innerHTML = `<form class="quote-create-form"><header class="quote-create-heading"><h2 id="quote-create-title">Nova cotação</h2><button class="quote-create-close" type="button" data-close aria-label="Fechar nova cotação">×</button></header><div class="quote-create-fields"><label>Descrição<input name="title" required maxlength="200" value="${escapeHtml(draft.title)}" placeholder="Ex.: Reposição da semana" autocomplete="off"></label><label>Data<input name="date" type="date" required value="${escapeHtml(draft.date)}"></label><label class="quote-create-notes">Observação<textarea name="notes" maxlength="4000" rows="6" placeholder="Observação da cotação (opcional)">${escapeHtml(draft.notes)}</textarea></label><p class="quote-error" role="alert"></p></div><footer class="quote-create-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="submit">Salvar e abrir cotação</button></footer></form>`;
  const form = dialog.querySelector('form'),
    submit = form.querySelector('[type=submit]');
  const capture = () =>
    Object.assign(draft, {
      title: form.elements.title.value,
      date: form.elements.date.value,
      notes: form.elements.notes.value,
    });
  const finish = (reason) => {
    if (settled) return;
    capture();
    settled = true;
    events.abort();
    if (reason !== 'navigation' && draftState === draft) draftState = null;
    if (dialog.open) dialog.close();
    dialog.remove();
    document.body.style.overflow = previousOverflow;
    if (reason === 'cancel') {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      onCancel();
    }
  };
  const cancel = () => {
    if (!saving) finish('cancel');
  };
  dialog.querySelector('[data-close]').onclick = cancel;
  dialog.querySelector('[data-cancel]').onclick = cancel;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancel();
  });
  dialog.addEventListener('close', () => {
    if (!settled) finish('navigation');
  });
  form.addEventListener('input', capture);
  form.addEventListener('change', capture);
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving || settled) return;
    capture();
    saving = true;
    const controls = form.querySelectorAll('button,input,textarea');
    controls.forEach((node) => (node.disabled = true));
    submit.textContent = 'Salvando…';
    dialog.querySelector('.quote-error').textContent = '';
    try {
      const quote = await save({ title: draft.title, date: draft.date, notes: draft.notes });
      if (settled || !host.isConnected) return;
      finish('saved');
      onSaved(quote);
    } catch (error) {
      if (!settled && host.isConnected) dialog.querySelector('.quote-error').textContent = error.message;
    } finally {
      saving = false;
      if (!settled) {
        controls.forEach((node) => (node.disabled = false));
        submit.textContent = 'Salvar e abrir cotação';
      }
    }
  };
  window.addEventListener('hashchange', () => finish('navigation'), { signal: events.signal });
  host.append(dialog);
  document.body.style.overflow = 'hidden';
  dialog.showModal();
  form.elements.title.focus();
  return dialog;
}
