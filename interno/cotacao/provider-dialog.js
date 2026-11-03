import { escapeHtml as esc } from '../../shared/ui.js';
import { normalizeSearch } from '../../shared/filters.js';
import { partners, addPartner } from '../cadastros/parceiros/state.js';

export function openQuoteProviderDialog({
  host,
  items,
  trigger,
  onSubmit,
  onClose = () => {},
  createPartner = addPartner,
}) {
  const existing = host.querySelector('.quote-provider-dialog');
  if (existing) return existing;
  const dialog = document.createElement('dialog'),
    events = new AbortController(),
    previousOverflow = document.body.style.overflow;
  let settled = false,
    saving = false,
    selected = new Set(),
    created = null;
  let available = partners.filter(
    (row) => ['Fornecedor', 'Ambos'].includes(row.type) && !items.some((item) => item.id === row.id),
  );
  dialog.className = 'quote-product-dialog quote-provider-dialog';
  dialog.setAttribute('aria-labelledby', 'quote-provider-title');
  dialog.innerHTML = `<form><header class="quote-product-dialog-heading"><div><h2 id="quote-provider-title">Adicionar fornecedores</h2><p>Marque os fornecedores e adicione todos de uma vez.</p></div><button type="button" class="quote-product-dialog-close" data-close aria-label="Fechar fornecedores">×</button></header><section class="quote-provider-existing"><label>Buscar fornecedor<input type="search" name="search" placeholder="Nome ou CNPJ do fornecedor"></label><div class="quote-picker-selection"><label><input type="checkbox" data-select-all><span data-select-all-label>Selecionar todos os resultados</span></label><span data-selection-count role="status"></span></div><fieldset class="quote-provider-options"><legend class="visually-hidden">Fornecedores disponíveis</legend><div class="quote-provider-picker"></div></fieldset><button type="button" class="button secondary" data-new>Cadastrar novo fornecedor</button></section><section class="quote-provider-create" hidden><h3>Cadastrar novo fornecedor</h3><label>Nome<input name="name" maxlength="100" autocomplete="organization"></label><div class="catalog-fields"><label>E-mail<input name="email" type="email" maxlength="100"></label><label>Telefone<input name="phone" type="tel" maxlength="30"></label></div><button type="button" class="button secondary" data-existing>Selecionar fornecedor cadastrado</button></section><p class="quote-error" role="alert"></p><footer class="quote-product-dialog-actions"><button type="button" class="button secondary" data-cancel>Cancelar</button><button class="button primary" type="submit">Adicionar fornecedor</button></footer></form>`;
  const form = dialog.querySelector('form'),
    submit = form.querySelector('[type=submit]'),
    error = dialog.querySelector('.quote-error');
  let creating = false;
  const matchedRows = () => {
    const query = normalizeSearch(form.elements.search.value),
      digits = query.replace(/\D/g, '');
    return available.filter(
      (row) =>
        normalizeSearch([row.name, row.legalName, row.cnpj].filter(Boolean).join(' ')).includes(query) ||
        (digits.length > 0 && /^[-.\/\s\d]+$/.test(query) && String(row.cnpj || '').includes(digits)),
    );
  };
  const all = dialog.querySelector('[data-select-all]'), count = dialog.querySelector('[data-selection-count]');
  const selectionStatus = () => {
    const rows = matchedRows();
    all.checked = rows.length > 0 && rows.every((row) => selected.has(row.id));
    all.indeterminate = !all.checked && rows.some((row) => selected.has(row.id));
    all.disabled = saving || !rows.length;
    dialog.querySelector('[data-select-all-label]').textContent = `Selecionar todos os ${rows.length} resultados`;
    count.textContent = `${selected.size} fornecedor(es) selecionado(s)`;
    if (!creating && !created) {
      submit.textContent = saving ? 'Adicionando…' : `Adicionar selecionados (${selected.size})`;
      submit.disabled = saving || !selected.size;
    }
  };
  const draw = () => {
    const rows = matchedRows();
    dialog.querySelector('.quote-provider-picker').innerHTML = rows.length
      ? rows
          .map(
            (row) =>
              `<label class="quote-provider-option"><input type="checkbox" name="provider" value="${esc(row.id)}" ${selected.has(row.id) ? 'checked' : ''}><span class="quote-provider-identity"><strong>${esc(row.name)}</strong><small>CNPJ: ${esc(String(row.cnpj || '').replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')) || 'Não informado'}</small></span></label>`,
          )
          .join('')
      : `<p class="quote-product-empty">${available.length ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor disponível para adicionar.'}</p>`;
    dialog.querySelectorAll('[name=provider]').forEach(
      (input) =>
        (input.onchange = () => {
          if (input.checked) selected.add(input.value); else selected.delete(input.value);
          selectionStatus();
          error.textContent = '';
        }),
    );
    selectionStatus();
  };
  const mode = (value) => {
    creating = value;
    dialog.querySelector('.quote-provider-existing').hidden = value;
    dialog.querySelector('.quote-provider-create').hidden = !value;
    form.elements.name.required = value;
    for (const key of ['name', 'email', 'phone']) form.elements[key].disabled = !value;
    submit.textContent = value ? 'Cadastrar e adicionar' : `Adicionar selecionados (${selected.size})`;
    submit.disabled = !value && !selected.size;
    (value ? form.elements.name : form.elements.search).focus();
    error.textContent = '';
  };
  const finish = (reason) => {
    if (settled) return;
    settled = true;
    events.abort();
    if (dialog.open) dialog.close();
    dialog.remove();
    document.body.style.overflow = previousOverflow;
    if (reason !== 'navigation' && trigger?.isConnected) trigger.focus({ preventScroll: true });
    onClose(reason);
  };
  const cancel = () => {
    if (!saving) finish('cancel');
  };
  dialog.querySelector('[data-close]').onclick = cancel;
  dialog.querySelector('[data-cancel]').onclick = cancel;
  dialog.querySelector('[data-new]').onclick = () => mode(true);
  dialog.querySelector('[data-existing]').onclick = () => mode(false);
  form.elements.search.oninput = draw;
  all.onchange = () => {
    for (const row of matchedRows()) { if (all.checked) selected.add(row.id); else selected.delete(row.id); }
    draw();
  };
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancel();
  });
  dialog.addEventListener('close', () => {
    if (!settled) finish('navigation');
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving || settled) return;
    saving = true;
    error.textContent = '';
    form.querySelectorAll('button,input').forEach((node) => (node.disabled = true));
    form.setAttribute('aria-busy', 'true');
    submit.textContent = 'Adicionando…';
    let added = 0;
    try {
      let provider = created;
      if (creating && !created) {
        provider = await createPartner({
          name: form.elements.name.value,
          type: 'Fornecedor',
          email: form.elements.email.value,
          phone: form.elements.phone.value,
        });
        created = provider;
      }
      const rows = creating ? (provider ? [provider] : []) : available.filter((row) => selected.has(row.id));
      if (!rows.length) throw Error('Selecione pelo menos um fornecedor ou cadastre um novo.');
      for (const row of rows) {
        if (settled || !host.isConnected) return;
        await onSubmit(row);
        selected.delete(row.id);
        available = available.filter((provider) => provider.id !== row.id);
        added++;
        if (!settled) count.textContent = `${added} de ${rows.length} fornecedor(es) adicionado(s)…`;
      }
      if (!settled && host.isConnected) finish('saved');
    } catch (e) {
      if (!settled)
        error.textContent =
          (created ? 'Fornecedor cadastrado. Não foi possível confirmar o vínculo: ' : added ? `${added} fornecedor(es) já adicionado(s). Os restantes continuam selecionados. ` : '') + e.message;
    } finally {
      saving = false;
      if (!settled) {
        form.querySelectorAll('button,input').forEach((node) => (node.disabled = false));
        form.setAttribute('aria-busy', 'false');
        draw();
        if (!creating) for (const key of ['name', 'email', 'phone']) form.elements[key].disabled = true;
        if (created) {
          for (const key of ['name', 'email', 'phone']) form.elements[key].disabled = true;
          dialog.querySelector('[data-existing]').disabled = true;
          submit.textContent = 'Adicionar fornecedor cadastrado';
        }
      }
    }
  };
  window.addEventListener('hashchange', () => finish('navigation'), { signal: events.signal });
  host.append(dialog);
  draw();
  document.body.style.overflow = 'hidden';
  dialog.showModal();
  mode(false);
  return dialog;
}
