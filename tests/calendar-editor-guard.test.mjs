import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEditorCloseGuard} from '../interno/calendario/editor-guard.js';
function environment() {
  const values = {title: 'Reunião', date: '2026-10-20', time: '', type: 'event', color: 'blue', notes: ''};
  const controls = [{validity: {badInput: false}}], dialogs = []; let closed = 0;
  const focus = {isConnected: true, focused: false, focus() {this.focused = true;}};
  class Dialog extends EventTarget {
    open = false; removed = false; buttons = {keep: {focus() {this.focused = true;}}, discard: {focus() {}}};
    setAttribute() {} querySelector(selector) {return this.buttons[selector.includes('keep') ? 'keep' : 'discard'];}
    showModal() {this.open = true;} close() {this.open = false;} remove() {this.removed = true;}
  }
  const document = {activeElement: focus, createElement() {const dialog = new Dialog(); dialogs.push(dialog); return dialog;}};
  const form = {ownerDocument: document, elements: controls, querySelector() {return focus;}};
  const guard = createEditorCloseGuard({form, host: {append() {}}, onClose() {closed++;}, readSnapshot: () => JSON.stringify(values)});
  return {guard, values, controls, dialogs, focus, get closed() {return closed;}, get current() {return dialogs.at(-1);}};
}
test('calendar pristine and reverted forms close without prompting, once only', () => {
  const first = environment(); first.guard.requestClose(); first.guard.requestClose(); assert.equal(first.closed, 1); assert.equal(first.dialogs.length, 0);
  const reverted = environment(); reverted.values.title = 'Changed'; reverted.values.title = 'Reunião'; reverted.guard.requestClose(); assert.equal(reverted.closed, 1); assert.equal(reverted.dialogs.length, 0);
});
test('calendar dirty confirmation keeps raw invalid fields, focuses Keep and rejects duplicate prompts', () => {
  const env = environment(); env.values.title = '   '; env.values.date = ''; env.values.notes = 'Unfinished <draft>'; env.guard.requestClose(); env.guard.requestClose();
  assert.equal(env.dialogs.length, 1); assert.equal(env.closed, 0); assert.equal(env.current.open, true); assert.equal(env.current.buttons.keep.focused, true);
  env.current.buttons.keep.onclick(); assert.equal(env.current.removed, true); assert.equal(env.closed, 0); assert.equal(env.focus.focused, true);
  assert.deepEqual([env.values.title, env.values.date, env.values.notes], ['   ', '', 'Unfinished <draft>']);
  env.guard.requestClose(); assert.equal(env.dialogs.length, 2); env.current.buttons.discard.onclick(); assert.equal(env.closed, 1); assert.equal(env.current.removed, true);
});
test('calendar Escape on discard confirmation returns to original form without discarding', () => {
  const env = environment(); env.values.notes = 'Draft'; env.guard.requestClose(); const event = new Event('cancel', {cancelable: true}); env.current.dispatchEvent(event);
  assert(event.defaultPrevented); assert.equal(env.closed, 0); assert.equal(env.values.notes, 'Draft'); assert.equal(env.current.removed, true);
});
test('calendar incomplete native date/time input prompts even when browser value is empty', () => {
  const env = environment(); env.controls[0].validity.badInput = true; env.guard.requestClose(); assert.equal(env.closed, 0); assert.equal(env.current.open, true);
  env.current.buttons.keep.onclick(); assert.equal(env.controls[0].validity.badInput, true);
});
test('calendar successful save can dispose confirmation without discarding twice', () => {
  const env = environment(); env.values.title = 'New'; env.guard.requestClose(); env.guard.dispose(); env.guard.requestClose(); assert.equal(env.current.open, false); assert.equal(env.current.removed, true); assert.equal(env.closed, 0);
});
test('calendar close controls share the guard and removed notices stay absent', async () => {
  const source = await readFile(new URL('../interno/calendario/index.js', import.meta.url), 'utf8');
  assert.match(source, /\[data-cancel\].*guard.requestClose/); assert.match(source, /\[data-close\].*guard.requestClose/); assert.match(source, /event.stopPropagation\(\); guard.requestClose\(\)/);
  assert(!source.includes('calendar-storage-note')); assert(!source.includes('calendar-dialog-note')); assert(!source.includes('window.confirm'));
});
