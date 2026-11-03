import test from 'node:test';
import assert from 'node:assert/strict';
import { bindFinishButton } from '../interno/encartes/editor/finish.js';
import { createDesign, createTextElement } from '../interno/encartes/model.js';
function fixture() {
  const design = createDesign();
  design.elements.push(createTextElement(design));
  const state = { design, tab: 'create' }, runtime = { revision: 0 };
  let resolve, writes = 0, paints = 0, scope = 'a';
  const pending = new Promise(done => { resolve = done; });
  const messages = [], attrs = new Map();
  const button = { textContent: 'Concluir arte', disabled: false,
    setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k) };
  bindFinishButton(button, { state, runtime, persist: () => { writes++; return pending; },
    status: text => { state.saveMessage = text; }, message: text => messages.push(text),
    sessionKey: () => scope, isCurrent: () => true, paint: async () => { paints++; } });
  return { state, runtime, button, resolve, messages, attrs,
    writes: () => writes, paints: () => paints, changeSession: () => { scope = 'b'; } };
}
test('finish immediately shows progress and duplicate clicks do not queue writes', async () => {
  const f = fixture(), saving = f.button.onclick();
  assert.equal(f.button.disabled, true);
  assert.equal(f.button.textContent, 'Concluindo…');
  assert.equal(f.attrs.get('aria-busy'), 'true');
  await f.button.onclick();
  assert.equal(f.writes(), 1);
  assert.equal(f.state.tab, 'create');
  f.resolve(true); await saving;
  assert.equal(f.state.tab, 'created');
  assert.equal(f.paints(), 1);
});
test('failed finish stays open and permits retry without reporting success', async () => {
  const f = fixture(), saving = f.button.onclick();
  f.resolve(false); await saving;
  assert.equal(f.state.tab, 'create');
  assert.equal(f.button.disabled, false);
  assert.equal(f.button.textContent, 'Tentar concluir novamente');
  assert.equal(f.paints(), 0);
  await f.button.onclick(); assert.equal(f.writes(), 2);
});
test('editing during finish keeps the latest changes open', async () => {
  const f = fixture(), saving = f.button.onclick();
  f.runtime.revision++;
  f.state.design.status = 'draft';
  f.resolve(true); await saving;
  assert.equal(f.state.tab, 'create');
  assert.equal(f.paints(), 0);
  assert.match(f.messages[0], /últimas alterações/);
});
test('finish from an old session never navigates or reports success in the new session', async () => {
  const f = fixture(), saving = f.button.onclick();
  f.changeSession(); f.resolve(true); await saving;
  assert.equal(f.paints(), 0); assert.equal(f.messages.length, 0);
});
