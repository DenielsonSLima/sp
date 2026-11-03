import { clearOnContextChange } from '../../remote.js';
import { saveModel } from '../state.js';
import { partInput } from '../presentation.js';
const drafts = new Map();
clearOnContextChange('butcher_models', () => drafts.clear());
const draftFrom = (model) => ({
  ...structuredClone(model),
  compositionMode: model.compositionMode || 'percent',
  weighingTotal: (model.weighing?.totalWeight || '').replace('.', ','),
  parts: model.parts.map((part) => ({
    ...partInput(part),
    weight: (model.weighing?.rows.find((row) => row.productId === part.productId)?.weight || '').replace('.', ','),
  })),
});
export function useModelEditor(model) {
  let draft = drafts.get(model.id) || draftFrom(model);
  let dirty = drafts.has(model.id);
  return {
    get draft() { return draft; },
    get dirty() { return dirty; },
    change(patch) {
      draft = { ...draft, ...patch };
      dirty = true;
      drafts.set(model.id, structuredClone(draft));
    },
    reset(saved) {
      draft = draftFrom(saved);
      dirty = false;
      drafts.delete(model.id);
    },
    async save() {
      const saved = await saveModel(draft);
      this.reset(saved);
      return saved;
    },
  };
}
