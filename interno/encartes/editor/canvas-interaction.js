import { createCanvasInteraction } from '../interaction.js';
import { isAutomaticModelField } from './template-fields.js';
export async function bindEditorCanvas({
  root,
  state: S,
  selected,
  select,
  update,
  requestDraw,
  mutate,
  message,
  isCurrent,
  getGuides,
  onSnap = () => {},
  createInteraction = createCanvasInteraction,
}) {
  let interaction = null;
  const host = root.querySelector('.flyer-interaction');
  try {
    const created = await createInteraction({
      host,
      getGuides,
      onSnap: (lines) => {
        if (isCurrent() && host?.isConnected) onSnap(lines);
      },
      onSelect: (id) => {
        if (isCurrent() && host?.isConnected) select(id);
      },
      onEdit: (id) => {
        if (!isCurrent() || !host?.isConnected) return;
        select(id);
        const field = root.querySelector('.flyer-properties textarea,.flyer-properties input[name=name]');
        field?.focus();
      },
      onChange: (id, patch, commit) => {
        if (!isCurrent() || !host?.isConnected) return;
        const item = S.design.elements.find((e) => e.id === id);
        if (!item || item.locked) return;
        Object.assign(item, patch);
        if (commit) update(structuredClone(S.design));
        else requestDraw();
      },
    });
    if (!isCurrent() || !host?.isConnected) {
      created?.destroy();
      return;
    }
    interaction = created;
  } catch (error) {
    if (isCurrent() && root.isConnected) message(error.message, true);
  }
  const stage = root.querySelector('.flyer-stage');
  if (!stage || !isCurrent()) return;
  stage.onkeydown = (event) => {
    if (event.defaultPrevented || event.target.matches('input,textarea,select,[data-guide-axis]')) return;
    const item = selected();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      root.querySelector(event.shiftKey ? '.flyer-redo' : '.flyer-undo').click();
      return;
    }
    if (!item || item.locked) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (isAutomaticModelField(S.design, item)) {
        message('Este campo será preenchido pela promoção. Você pode movê-lo, redimensioná-lo ou ocultá-lo.');
        return;
      }
      mutate((d) => {
        d.elements = d.elements.filter((e) => e.id !== item.id);
        S.selection = null;
      });
    }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (delta) {
      event.preventDefault();
      mutate((d) => {
        const element = d.elements.find((e) => e.id === item.id),
          step = event.shiftKey ? 10 : 1;
        element.x += delta[0] * step;
        element.y += delta[1] * step;
      });
    }
  };
  return interaction;
}
