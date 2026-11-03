import { validateDesign } from '../model.js';

export function bindFinishButton(button, { state, runtime, persist, status, message, sessionKey, isCurrent, paint }) {
  let busy = false;
  button.onclick = async () => {
    if (busy) return;
    if (!state.design.elements.length) {
      message('Adicione texto ou imagens antes de concluir.', true);
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = 'Concluindo…';
    button.setAttribute('aria-busy', 'true');
    const scope = sessionKey(), id = state.design.id;
    const current = () => isCurrent() && scope === sessionKey() && id === state.design.id;
    try {
      clearTimeout(runtime.saveTimer);
      state.design = validateDesign({ ...state.design, status: 'created', updatedAt: new Date().toISOString() });
      const revision = ++runtime.revision;
      status('Alterações pendentes');
      const saved = await persist();
      if (!current()) return;
      if (!saved) {
        button.textContent = 'Tentar concluir novamente';
        return;
      }
      if (runtime.revision !== revision) {
        message('Você alterou a arte durante o salvamento. Conclua novamente para incluir as últimas alterações.');
        return;
      }
      state.tab = 'created';
      await paint();
      message('Arte concluída e salva.');
    } catch (error) {
      if (current()) {
        status('Não foi possível salvar');
        message(error.message, true);
        button.textContent = 'Tentar concluir novamente';
      }
    } finally {
      busy = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (button.textContent === 'Concluindo…') button.textContent = 'Concluir arte';
    }
  };
}
