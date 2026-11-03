import { renderDetail } from './detail.js';
import { returnRepository as store, totals, money, today, settlementMethods } from './state.js';
import { esc, base, dateLabel, badge } from './common.js';
export function openSettlement(root, r) {
  if (root.querySelector('dialog')) return;
  const trigger = root.querySelector('[data-settle]');
  const dialog = document.createElement('dialog');
  dialog.className = 'return-dialog';
  dialog.setAttribute('aria-labelledby', 'return-settle-title');
  dialog.innerHTML = `<form><h2 id="return-settle-title">Registrar acerto</h2><p>Saldo pendente: <strong>${money(totals(r).pending)}</strong>. Este registro não transfere dinheiro nem emite documento fiscal.</p><div class="return-fields"><label class="return-wide">Forma de acerto<select name="method" required><option value="">Selecione a forma</option>${Object.entries(
    settlementMethods,
  )
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join(
      '',
    )}</select></label><label>Valor recebido/compensado (R$)<input name="amount" inputmode="decimal" required placeholder="0,00"></label><label>Data do acerto<input name="date" type="date" min="${r.date}" value="${today()}" required></label><label class="return-wide">Referência ou observação (opcional)<input name="reference" maxlength="300" placeholder="Ex.: comprovante, crédito ou compra abatida"></label></div><p class="return-error" role="alert"></p><div class="return-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="submit">Confirmar registro</button></div></form>`;
  root.append(dialog);
  dialog.showModal();
  const close = () => {
    dialog.close();
    dialog.remove();
    if (trigger.isConnected) trigger.focus();
  };
  dialog.querySelector('[data-cancel]').onclick = close;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  let saving = false;
  dialog.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const button = dialog.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await store.settle(r.id, Object.fromEntries(new FormData(event.currentTarget)));
      if (!root.isConnected) return;
      close();
      renderDetail(root, r.id);
      root.querySelector('[data-settle]')?.focus();
    } catch (error) {
      if (dialog.isConnected) dialog.querySelector('.return-error').textContent = error.message;
    } finally {
      saving = false;
      if (button.isConnected) button.disabled = false;
    }
  };
}
