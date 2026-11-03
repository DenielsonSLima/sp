import test from 'node:test';
import assert from 'node:assert/strict';
import { offerHistoryMarkup } from '../interno/cotacao/offer-history.js';
const history = { previousCents: 1390, quotedOn: '2026-10-20', trend: 'up' };
test('historical unit price exposes date to hover, keyboard and accessible description', () => {
  const html = offerHistoryMarkup(history);
  assert.match(html,/Anterior: R\$\s*13,90/);
  assert.match(html,/20\/10\/2026/);
  assert.match(html,/tabindex="0"/);
  assert.match(html,/aria-label="Preço anterior/);
  assert.match(html,/is-up/);
  assert.match(html,/Preço subiu/);
  assert.match(offerHistoryMarkup({...history,trend:'down'}),/is-down/);
  assert.doesNotMatch(offerHistoryMarkup({...history,trend:'equal'}),/<svg/);
});
test('missing history stays hidden and unsaved drafts never display an outdated direction', () => {
  assert.equal(offerHistoryMarkup(null),'');
  assert.equal(offerHistoryMarkup({...history,quotedOn:'invalid'}),'');
  const html = offerHistoryMarkup(history,{pending:true});
  assert.match(html,/Anterior:/);
  assert.doesNotMatch(html,/<svg|Preço subiu/);
});

test('winner check stays in the card header and autosave preserves the icon', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../interno/cotacao/detail.js',import.meta.url),'utf8');
  const header = source.slice(source.indexOf('return `<td class="quote-offer'),source.indexOf('<form class="offer-form"',source.indexOf('return `<td class="quote-offer')));
  assert.match(header,/choose-offer/);
  assert.match(header,/icon\('check'\)/);
  assert.match(header,/aria-pressed/);
  assert.doesNotMatch(source,/choose\.textContent|○ Selecionar vencedor|● Vencedor/);
});
