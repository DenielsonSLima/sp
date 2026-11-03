import { bindFormDialog } from '../../../../shared/form-dialog.js';
import { bindProductPicker } from './product-picker.js';

export function bindProductDialog(root, options) {
  const form = document.createElement('form');
  form.hidden = true;
  form.innerHTML = `<h2>Selecionar produtos</h2>
    <div class="butcher-picker"></div>
    <p class="butcher-help">Cada produto é salvo no modelo ao adicionar, mesmo sem peso ou percentual. Preencha os valores depois.</p>
    <div class="butcher-actions"><button class="button primary finish-selection" type="button">Concluir seleção</button></div>`;
  const modal = bindFormDialog(form, {
    host: root,
    resource: 'butcher_models',
    cancelSelector: '.finish-selection',
    wide: true,
  });
  modal.dialog.classList.add('butcher-product-dialog');
  const refresh = bindProductPicker(form.querySelector('.butcher-picker'), options);
  form.onsubmit = (event) => event.preventDefault();
  form.querySelector('.finish-selection').onclick = () => modal.close();
  root.querySelector('.select-products').onclick = () => {
    modal.open();
    refresh();
  };
  return refresh;
}
