import { offerHistoryMarkup } from './offer-history.js';
import { matrixTotalsMarkup, approvedGrandTotalMarkup } from './supplier-summary.js';
import { comparison, money, quoteLineTotal } from './state.js';

const writeMarkup = (element, markup) => {
  if (element && element.innerHTML !== markup) element.innerHTML = markup;
};

/** A price changes the comparison of one product, not every product in the matrix. */
export function refreshOfferMatrix(root, q, { itemId, drafts, blocked, amounts = true }) {
  const matrix = root.querySelector('.quote-price-matrix');
  if (!matrix) return;
  const selector = itemId ? `.offer-form[data-item="${itemId}"]` : '.offer-form';
  const pendingItems = new Set([...drafts.keys()].map((key) => key.split('|')[0]));
  for (const form of matrix.querySelectorAll(selector)) {
    const { item, provider } = form.dataset;
    const cell = form.closest('.quote-offer');
    const has = Number.isInteger(q.offers[item]?.[provider]);
    const chosen = q.awards[item] === provider;
    const dirty = drafts.has(`${item}|${provider}`);
    const rowPending = pendingItems.has(item);
    const result = comparison(q, item);
    const lowest = !rowPending && result.lowest.includes(provider);
    cell.classList.toggle('is-lowest', has && lowest && !dirty);
    cell.classList.toggle('chosen', chosen);
    writeMarkup(cell.querySelector('.offer-badges'),
      `${chosen ? '<span class="tag tag-green">Escolhido</span>' : ''}${rowPending ? '<span class="tag">Preço pendente</span>' : has && lowest ? `<span class="tag tag-green">${result.lowest.length > 1 ? 'Empate' : 'Menor preço'}</span>` : has ? '' : '<span class="tag">Sem preço</span>'}`);
    cell.querySelector('.offer-draft-note').hidden = !dirty;
    writeMarkup(cell.querySelector('.offer-history'), offerHistoryMarkup(q.computed.priceHistory?.[item]?.[provider], { pending: dirty }));
    if (amounts) writeMarkup(cell.querySelector('.offer-total'), has
      ? `Total <strong>${money(quoteLineTotal(q, item, provider))}</strong>` : '—');
    const choose = cell.querySelector('.choose-offer');
    if (choose) {
      choose.disabled = !has || blocked || form.elements.price.disabled;
      choose.setAttribute('aria-pressed', String(chosen));
      choose.setAttribute('aria-label',
        `${chosen ? 'Desmarcar vencedor' : 'Selecionar vencedor'}: ${q.providers.find((p) => p.id === provider).name}, ${q.items.find((i) => i.id === item).name}`);
      choose.title = chosen ? 'Desmarcar vencedor' : 'Selecionar vencedor';
    }
  }
  // Winner selection is globally blocked while drafts exist. Only this transition touches other rows' buttons.
  if (matrix.dataset.offersBlocked !== String(blocked)) {
    matrix.dataset.offersBlocked = String(blocked);
    for (const choose of matrix.querySelectorAll('.choose-offer')) {
      const { item, provider } = choose.dataset;
      const input = choose.closest('.quote-offer').querySelector('.offer-form').elements.price;
      choose.disabled = blocked || !Number.isInteger(q.offers[item]?.[provider]) || input.disabled;
    }
  }
  if (!amounts) return;
  writeMarkup(matrix.querySelector('tfoot'), matrixTotalsMarkup(q));
  const approved = root.querySelector('.quote-approved-grand-total');
  const markup = approvedGrandTotalMarkup(q);
  if (approved && approved.outerHTML !== markup) approved.outerHTML = markup;
}
