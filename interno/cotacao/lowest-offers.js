import { escapeHtml as esc } from '../../shared/ui.js';
import { comparison, quoteLineTotal, money } from './state.js';
import { unitLabel } from '../cadastros/unidades/state.js';

/** Present PostgreSQL comparisons; suggestions never create manual awards. */
export function lowestOffersMarkup(q, { itemPhoto, drafts = new Map() }) {
  const rows = q.items.map((item) => {
    const result = comparison(q, item.id);
    const pending = [...drafts.keys()].some((key) => key.startsWith(item.id + '|'));
    const lowest = result?.lowest || [];
    const providers = q.providers.filter((provider) => lowest.includes(provider.id));
    const missing = q.providers.filter((provider) => quoteLineTotal(q, item.id, provider.id) == null);
    const unavailable = !result || (result.min != null && !providers.length);
    let offer;
    if (pending) {
      offer = '<div class="quote-lowest-state"><strong>Preço aguardando salvamento</strong><span>Confira o campo na aba Produtos para atualizar a comparação.</span></div>';
    } else if (unavailable) {
      offer = '<div class="quote-lowest-state"><strong>Comparação indisponível</strong><span>Reabra a cotação para carregar os valores calculados.</span></div>';
    } else if (result.min == null) {
      offer = '<div class="quote-lowest-state"><strong>Nenhum preço informado</strong><span>Informe ao menos um preço na aba Produtos para comparar este produto.</span></div>';
    } else {
      const total = quoteLineTotal(q, item.id, providers[0].id);
      offer = `<div class="quote-lowest-provider"><span class="tag tag-green">${providers.length > 1 ? 'Empate no menor preço' : 'Menor preço'}</span><strong>${providers.map((provider) => esc(provider.name)).join('<br>')}</strong><span>${result.priced} de ${q.providers.length} fornecedores com preço</span></div><div class="quote-lowest-price"><strong>${money(result.min)}</strong><span>por ${esc(unitLabel(item.unit))}</span>${total == null ? '' : `<small>Total da quantidade: <b>${money(total)}</b></small>`}</div>`;
    }
    const chosen = q.providers.find((provider) => provider.id === q.awards[item.id]);
    return `<article class="quote-lowest-row" data-lowest-item="${esc(item.id)}"><div class="quote-product-identity">${itemPhoto(item)}<div><strong>${esc(item.name)}</strong><span>${esc(item.quantity)} ${esc(unitLabel(item.unit))}</span>${chosen ? `<small>Escolhido: ${esc(chosen.name)}</small>` : ''}</div></div>${offer}${!pending && !unavailable && result.min != null && missing.length ? `<div class="quote-lowest-missing"><strong>Sem preço:</strong> ${missing.map((provider) => esc(provider.name)).join(', ')}</div>` : ''}</article>`;
  }).join('');
  return `<section class="card quote-results quote-lowest-results"><div class="quote-panel-heading"><h2>Menores preços por produto</h2><button class="button secondary" type="button" data-open-quote-tab="prices">Comparar e escolher</button></div><p class="quote-explanation">Comparação dos preços unitários salvos, antes dos descontos. A escolha do fornecedor é manual.</p><div class="quote-lowest-list">${rows}</div></section>`;
}
