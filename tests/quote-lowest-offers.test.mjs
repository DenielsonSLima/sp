import test from 'node:test';
import assert from 'node:assert/strict';
import { lowestOffersMarkup } from '../interno/cotacao/lowest-offers.js';
import { renderDetail } from '../interno/cotacao/detail.js';
import { quotes } from '../interno/cotacao/state.js';

const fixture = () => ({
  id: 'comparison-before-awards', title: 'Reposição', date: '2026-11-02', status: 'open',
  items: [{ id: 'rice', name: 'Arroz', quantity: 3, unit: 'UND', category: 'Alimentos' }],
  providers: [{ id: 'a', name: 'Fornecedor A' }, { id: 'b', name: 'Fornecedor B' }, { id: 'c', name: 'Fornecedor C' }],
  offers: { rice: { a: 900, b: 1000 } }, awards: {},
  computed: {
    comparisons: { rice: { min: 900, lowest: ['a'], priced: 2 } },
    lineTotals: { rice: { a: 2700, b: 3000 } },
    selectedTotal: 0, awardedByProvider: [], totals: [], minimumCompleteTotal: null,
  },
});
const itemPhoto = () => '';

test('comparison lists saved lowest offers before any manual choice and warns about missing supplier prices', () => {
  const q = fixture(), original = structuredClone(q);
  const html = lowestOffersMarkup(q, { itemPhoto });
  assert.match(html, /Menores preços por produto/);
  assert.match(html, /Fornecedor A/);
  assert.match(html, /R\$\s*9,00/);
  assert.match(html, /R\$\s*27,00/);
  assert.match(html, /2 de 3 fornecedores com preço/);
  assert.match(html, /Sem preço:<\/strong> Fornecedor C/);
  assert.doesNotMatch(html, /R\$\s*0,00/);
  assert.deepEqual(q, original, 'presenting suggestions cannot select a supplier');
});

test('ties list every supplier returned by PostgreSQL and preserve canonical amounts', () => {
  const q = fixture();
  q.computed.comparisons.rice = { min: 777, lowest: ['a', 'b'], priced: 2 };
  q.computed.lineTotals.rice = { a: 2331, b: 2331 };
  const html = lowestOffersMarkup(q, { itemPhoto });
  assert.match(html, /Empate no menor preço/);
  assert.match(html, /Fornecedor A<br>Fornecedor B/);
  assert.match(html, /R\$\s*7,77/);
  assert.match(html, /R\$\s*23,31/);
  assert.doesNotMatch(html, /R\$\s*9,00/);
});

test('missing prices and unavailable comparisons are distinct and never rank as zero', () => {
  const q = fixture();
  q.computed.comparisons.rice = { min: null, lowest: [], priced: 0 };
  q.computed.lineTotals.rice = {};
  let html = lowestOffersMarkup(q, { itemPhoto });
  assert.match(html, /Nenhum preço informado/);
  assert.doesNotMatch(html, /R\$/);
  delete q.computed.comparisons.rice;
  html = lowestOffersMarkup(q, { itemPhoto });
  assert.match(html, /Comparação indisponível/);
  assert.doesNotMatch(html, /Nenhum preço informado|R\$/);
});

test('unsaved input suppresses a stale recommendation and names are escaped', () => {
  const q = fixture();
  q.items[0].name = '<script>produto</script>';
  let html = lowestOffersMarkup(q, { itemPhoto, drafts: new Map([['rice|b', '1,00']]) });
  assert.match(html, /Preço aguardando salvamento/);
  assert.doesNotMatch(html, /R\$|<script>/);
  assert.match(html, /&lt;script&gt;/);
  q.providers[0].name = '<Fornecedor>';
  html = lowestOffersMarkup(q, { itemPhoto });
  assert.match(html, /&lt;Fornecedor&gt;/);
});

test('final comparison opens with lower prices while manual approvals remain empty', async (t) => {
  const q = fixture();
  quotes.push(q);
  t.after(() => quotes.splice(quotes.indexOf(q), 1));
  const review = {};
  const body = { innerHTML: '', querySelector: selector => selector === '.quote-review-products' ? review : null, querySelectorAll: () => [] };
  const tabs = ['summary', 'prices', 'providers', 'result'].map(tab => ({ dataset: { tab }, focus() {} }));
  const root = {
    isConnected: true, innerHTML: '',
    querySelector: selector => selector === '.quote-detail-body' ? body : null,
    querySelectorAll: selector => selector === '[data-tab]' ? tabs : [],
  };
  await renderDetail(root, q.id);
  assert.doesNotMatch(body.innerHTML, /quote-detail-summary|total escolhido/);
  tabs[3].onclick();
  assert.match(body.innerHTML, /Menores preços por produto/);
  assert.match(body.innerHTML, /R\$\s*9,00/);
  assert.match(body.innerHTML, /Escolha dos fornecedores/);
  assert.doesNotMatch(body.innerHTML, /quote-final-total/);
  assert.match(body.innerHTML, /finish-quote[^>]*disabled/);
  assert.deepEqual(q.awards, {});
});
