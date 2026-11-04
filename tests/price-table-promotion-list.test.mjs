import test from 'node:test';
import assert from 'node:assert/strict';
import { rowMarkup } from '../interno/tabela-precos/views/list-markup.js';

const promotion = { id: 'promotion', kind: 'promotion', name: 'Ofertas <semana>', itemCount: 3,
  start: '2026-11-03', end: '2026-11-09', status: 'draft' };

test('selected promotions have a card highlight and readable selection state in addition to their checkbox', () => {
  const unselected = rowMarkup(promotion, { tab: 'draft' }, false, false);
  const selected = rowMarkup(promotion, { tab: 'draft' }, false, true);
  assert.match(unselected, /Não selecionado/); assert.doesNotMatch(unselected, /class="card tp-row is-selected/);
  assert.match(selected, /class="card tp-row is-selected/); assert.match(selected, /data-check="promotion" checked/);
  assert.match(selected, /tp-selection-state">Selecionado/);
  assert.match(selected, /Selecionar Ofertas &lt;semana&gt;/);
  assert.match(selected, /3 produto\(s\)/); assert.match(selected, /03\/11\/2026 a 09\/11\/2026/);
  assert.doesNotMatch(selected, /Preço pendente|Modelo pendente/);
});

test('draft promotions and legacy drafts expose delete; sent and finalized records preserve their lifecycle', () => {
  assert.match(rowMarkup(promotion, { tab: 'draft' }, false, false), /data-delete="promotion">Excluir/);
  assert.match(rowMarkup({ id: 'legacy', name: 'Arroz', cents: 499, quantity: 2, templateName: 'A4' },
    { tab: 'draft' }, false, false), /data-delete="legacy">Excluir/);
  const sent = rowMarkup({ ...promotion, status: 'sent' }, { tab: 'sent' }, false, false);
  assert.doesNotMatch(sent, /data-delete/); assert.match(sent, /Abrir promoção/);
  const finalized = rowMarkup({ ...promotion, status: 'finalized' }, { tab: 'finalized', archived: true }, false, false);
  assert.doesNotMatch(finalized, /data-delete|data-check|tp-selection-state/);
  assert.match(finalized, /data-restore="promotion"/);
});
