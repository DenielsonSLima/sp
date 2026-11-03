import { bindFormDialog } from '../../../../shared/form-dialog.js';

export function bindModelNameDialog(root, { getName, onSave, status }) {
  const form = document.createElement('form');
  form.className = 'butcher-part-form butcher-name-form';
  form.hidden = true;
  form.innerHTML = `<h2>Editar modelo</h2>
    <div class="butcher-fields"><label>Nome do modelo<input name="name" required maxlength="80"></label></div>
    <div class="butcher-actions"><button class="button primary" type="submit">Salvar nome</button>
    <button class="button secondary cancel-name" type="button">Cancelar</button></div>`;
  const modal = bindFormDialog(form, {
    host: root,
    resource: 'butcher_models',
    cancelSelector: '.cancel-name',
    errorSource: status,
  });
  form.querySelector('.cancel-name').onclick = () => modal.close();
  root.querySelector('.edit-model').onclick = () => {
    form.elements.name.value = getName();
    modal.open();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]');
    if (submit.disabled) return;
    const name = form.elements.name.value.trim();
    if (!name) {
      modal.error('Informe o nome do modelo.');
      form.elements.name.focus();
      return;
    }
    submit.disabled = true;
    try {
      if (await onSave(name)) modal.close();
    } finally {
      submit.disabled = false;
    }
  };
}
