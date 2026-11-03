import { validateFlyerModel } from '../modelos/model.js';
import { downloadBlob } from '../export.js';
import { safeName } from './presentation.js';

export function createModelJsonBlob(design) {
  return new Blob([JSON.stringify(validateFlyerModel(design), null, 2)], { type: 'application/json' });
}

export function bindTemplateExport(root, { state, message }) {
  const button = root.querySelector('.flyer-export-model');
  if (!button) return;
  button.onclick = () => {
    try {
      downloadBlob(createModelJsonBlob(state.design), `${safeName(state.design.title)}-modelo.json`);
      message('Modelo pronto para download. Importe esse arquivo em Modelos para editar uma cópia.');
    } catch (error) { message(error.message, true); }
  };
}
