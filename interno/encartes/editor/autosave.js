import { getDataContext } from '../../../shared/data/api.js';
import { editorState as S } from '../editor-state.js';
import { validateDesign } from '../model.js';
import { saveDesign } from '../storage.js';
import { createSaveQueue } from './save-queue.js';
import { saveErrorMessage } from './save-error.js';
const saves = createSaveQueue();
let lastSaveError = '';
export const runtime = {
  saveTimer: null,
  saveQueue: Promise.resolve(),
  revision: 0,
  renderVersion: 0,
  activeRoot: null,
  sessionRevision: 0,
};
export const sessionKey = () => {
  const context = getDataContext();
  return JSON.stringify([context?.companyId, context?.user?.id, runtime.sessionRevision]);
};
export function status(text) {
  S.saveMessage = text;
  if (runtime.activeRoot?.isConnected)
    runtime.activeRoot.querySelector('.flyer-save-state')?.replaceChildren(document.createTextNode(text));
  const node = runtime.activeRoot?.querySelector('.flyer-save-state');
  if (node)
    node.dataset.state = text === 'Não foi possível salvar' ? 'error' : text === 'Salvando…' ? 'saving' : 'saved';
  const retry = runtime.activeRoot?.querySelector('.flyer-save');
  if (retry) retry.textContent = text === 'Não foi possível salvar' ? 'Tentar novamente' : 'Salvar';
}
export function message(text, error = false) {
  if (!runtime.activeRoot?.isConnected) return;
  const node = runtime.activeRoot.querySelector('.flyer-message');
  if (node) {
    node.textContent = text;
    node.classList.toggle('error', error);
  }
}
const pendingPersists = new Map();
export async function persist(design = S.design, { force = false } = {}) {
  if (!force && design.id === S.design.id && ['Nova arte', 'Arte salva'].includes(S.saveMessage)) return true;
  const snapshot = validateDesign(design),
    version = runtime.revision,
    scope = sessionKey(),
    key = scope + ':' + snapshot.id + ':' + version;
  if (pendingPersists.has(key)) return pendingPersists.get(key);
  status('Salvando…');
  const work = (async () => {
    const saving = saves.enqueue(scope + ':' + snapshot.id, () => {
      if (scope !== sessionKey()) throw Error('A sessão ou empresa ativa mudou. Abra a arte novamente.');
      return saveDesign(snapshot);
    });
    runtime.saveQueue = saves.whenIdle();
    try {
      await saving;
      if (scope === sessionKey() && version === runtime.revision && snapshot.id === S.design.id) {
        status('Arte salva');
        const node = runtime.activeRoot?.querySelector('.flyer-message');
        if (lastSaveError && node?.textContent === lastSaveError) message('');
        lastSaveError = '';
      }
      return true;
    } catch (error) {
      if (scope === sessionKey()) {
        if (snapshot.id === S.design.id) status('Não foi possível salvar');
        lastSaveError = saveErrorMessage(error);
        message(lastSaveError, true);
      }
      return false;
    } finally {
      pendingPersists.delete(key);
    }
  })();
  pendingPersists.set(key, work);
  return work;
}
export function scheduleSave() {
  runtime.revision++;
  status('Alterações pendentes');
  clearTimeout(runtime.saveTimer);
  runtime.saveTimer = setTimeout(() => persist(), 700);
}
