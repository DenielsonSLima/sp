import test from 'node:test';
import assert from 'node:assert/strict';
import { models } from '../interno/cadastros/acougue/queries.js';
import { receiptModelName } from '../interno/acougue/common.js';

test('receipt labels follow the current model name while the RPC category stays stable', t => {
  const before = structuredClone(models);
  t.after(() => models.splice(0, models.length, ...before));
  const category = 'Bovino · Macho';
  models.splice(0, models.length,
    { id: 'previous', category, name: 'Nome antigo', current: false, active: true },
    { id: 'current', category, name: 'BOVINO PADRÃO', current: true, active: true },
    { id: 'swine', category: 'Suíno', name: 'SUÍNO PADRÃO', current: true, active: true },
  );
  assert.equal(receiptModelName(category), 'BOVINO PADRÃO');
  models[1].name = 'BOVINO REVISADO';
  models[1]._version = 2;
  assert.equal(receiptModelName(category), 'BOVINO REVISADO');
  assert.equal(models[1].category, category);
  assert.equal(receiptModelName('Suíno'), 'SUÍNO PADRÃO');
  assert.equal(receiptModelName('Sem modelo atual'), 'Sem modelo atual');
  assert.equal(receiptModelName(''), '');
  models[1].current = false;
  models[0].active = false;
  assert.equal(receiptModelName(category), 'BOVINO REVISADO', 'the only active draft also uses its saved name');
  models[0].active = true;
  assert.equal(receiptModelName(category), category, 'ambiguous drafts do not imply a selected model');
});
