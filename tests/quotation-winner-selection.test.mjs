import test from 'node:test';
import assert from 'node:assert/strict';
import { useWinnerSelection } from '../interno/cotacao/hooks/use-winner-selection.js';

function fixture() {
  let resolve, reject, current = true, reason = '';
  const held = new Promise((yes, no) => { resolve = yes; reject = no; });
  const buttons = ['a', 'b'].map((item) => ({
    dataset: { item, provider: 'supplier' }, disabled: false, attributes: {}, classes: new Set(),
    setAttribute(key, value) { this.attributes[key] = value; },
    classList: { toggle(key, enabled) { enabled ? this.owner.classes.add(key) : this.owner.classes.delete(key); } },
  }));
  buttons.forEach((button) => { button.classList.owner = button; });
  const calls = [], messages = [], refreshes = [], quote = { awards: {} };
  const controller = useWinnerSelection({
    root: { querySelectorAll: () => buttons }, quote,
    choose: async (...args) => { calls.push(args); await held; quote.awards.a = 'supplier'; },
    blockedReason: () => reason, isCurrent: () => current,
    setMessage: (message) => messages.push(message),
    refresh: (options) => {
      refreshes.push(options);
      buttons.forEach((button) => { button.disabled = controller.isPending(); });
    },
  });
  controller.bind();
  return { controller, buttons, calls, messages, refreshes, quote, resolve, reject,
    leave: () => { current = false; }, block: () => { reason = 'Preço pendente'; } };
}

test('winner immediately shows saving, suppresses repeated clicks and confirms only after RPC', async () => {
  const f = fixture();
  const first = f.buttons[0].onclick();
  assert.equal(f.buttons[0].attributes['aria-busy'], 'true');
  assert.ok(f.buttons.every((button) => button.disabled));
  assert.match(f.messages[0], /Salvando/);
  assert.deepEqual(f.quote.awards, {});
  await f.buttons[0].onclick();
  await f.buttons[1].onclick();
  assert.equal(f.calls.length, 1);
  f.controller.bind(); // Switching tabs/rebuilding controls must not unlock a pending click.
  assert.equal(f.buttons[0].attributes['aria-busy'], 'true');
  f.resolve(); await first;
  assert.equal(f.quote.awards.a, 'supplier');
  assert.equal(f.buttons[0].attributes['aria-busy'], 'false');
  assert.ok(f.buttons.every((button) => !button.disabled));
  assert.deepEqual(f.refreshes, [{ itemId: 'a', amounts: false }, { itemId: 'a' }]);
});

test('failure releases the button without claiming success or changing awards', async () => {
  const f = fixture();
  const saving = f.buttons[0].onclick();
  f.reject(Error('Conflito de versão')); await saving;
  assert.deepEqual(f.quote.awards, {});
  assert.equal(f.messages.at(-1), 'Conflito de versão');
  assert.equal(f.controller.isPending(), false);
  assert.ok(f.buttons.every((button) => !button.disabled));
});

test('completion never paints another view and pending price drafts block selection', async () => {
  const f = fixture();
  const saving = f.buttons[0].onclick();
  f.leave(); f.resolve(); await saving;
  assert.equal(f.refreshes.length, 1);
  assert.equal(f.messages.length, 1);
  const blocked = fixture(); blocked.block(); await blocked.buttons[0].onclick();
  assert.equal(blocked.calls.length, 0);
  assert.equal(blocked.messages.at(-1), 'Preço pendente');
});
