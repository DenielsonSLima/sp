import { icon } from '../../shared/icons.js';
import { offerHistoryMarkup } from './offer-history.js';
import { refreshOfferMatrix } from './price-matrix-refresh.js';
import { bindQuotationTabs } from './tabs.js';
import { bindPriceAutosaves, bindDiscountAutosaves } from './detail-autosave.js';
import { awardedGroupsMarkup } from './award-groups.js';
import { lowestOffersMarkup } from './lowest-offers.js';
import { openProviderRemovalDialog } from './provider-removal-dialog.js';
import { useWinnerSelection } from './hooks/use-winner-selection.js';
import { useDetailRealtime } from './hooks/use-detail-realtime.js';
import { useProductPhotos } from './hooks/use-product-photos.js';
import { MAX_OFFER_CENTS } from './offer-input.js';
import { formatBRLCents } from '../../shared/components/currency-input/index.js';
import { openQuoteProviderDialog } from './provider-dialog.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { supplierSummaryMarkup, matrixTotalsMarkup, approvedGrandTotalMarkup } from './supplier-summary.js';
import { generateSupplierQuotePdfs } from './supplier-pdf.js';
import { openPdfDialog } from '../../shared/components/pdf-viewer/index.js';
import { openQuoteProductDialog } from './product-dialog.js';
import { providerPresentation, providerDot } from './presentation.js';
import { readQuotePreviews, loadQuoteProviders } from './services.js';
import { notice, heading, escapeHtml, back, dateLabel } from './common.js';
import { unitLabel } from '../cadastros/unidades/state.js';
import {
  getQuote,
  money,
  quoteLineTotal,
  chooseProvider,
  comparison,
  totals,
  selectedTotal,
  finalizeQuote,
  updateItemQuantity,
  addQuoteProvider,
  removeQuoteProvider,
  addQuoteItem,
  finalizeQuoteProvider,
  isProviderFinalized,
  isQuoteItemFinalized,
} from './state.js';
const priceDrafts = new Map();
const summaryDrafts = new Map();
const detailViews = new WeakMap();
export async function renderDetail(root, id) {
  detailViews.get(root)?.stop?.();
  const view = {};
  let live;
  detailViews.set(root, view);
  const q = getQuote(id);
  if (!q) {
    root.innerHTML =
      back +
      '<section class="card catalog-empty"><h2>Cotação não encontrada.</h2><p>Volte à lista para abrir uma cotação disponível.</p></section>';
    return;
  }
  if (!priceDrafts.has(id)) priceDrafts.set(id, new Map());
  const drafts = priceDrafts.get(id);
  if (!summaryDrafts.has(id))
    summaryDrafts.set(id, { quantities: new Map(), adding: { open: false, product: '', quantity: '1' } });
  const summaryDraft = summaryDrafts.get(id),
    quantityDrafts = summaryDraft.quantities,
    addDraft = summaryDraft.adding;
  const discountDrafts = (summaryDraft.discounts ??= new Map());
  const { loadCatalog, itemPhoto, refreshPhotos } = useProductPhotos(root, q, { isCurrent: () => isCurrentView() });
  const hasSummaryDrafts = () => quantityDrafts.size > 0 || addDraft.open;
  const supplierPending = () => Boolean(winner.isPending() || drafts.size || discountDrafts.size || hasSummaryDrafts());
  const draftKey = (item, provider) => item + '|' + provider;
  const addProductButton = () =>
    q.status === 'open'
      ? '<button type="button" class="button primary quote-add-product-toggle" data-add-quote-product>+ Adicionar produto</button>'
      : '';
  const addProviderButton = () =>
    q.status === 'open'
      ? '<button type="button" class="button secondary" data-add-quote-provider>+ Adicionar fornecedor</button>'
      : '';
  let tab = 'summary',
    message = '',
    matrixScroll = { left: 0, top: 0 };
  const isCurrentView = () =>
    root.isConnected &&
    detailViews.get(root) === view &&
    priceDrafts.get(id) === drafts &&
    root.querySelector(`[data-quote-detail="${id}"]`);
  // Update RPC results in place so a completed save never replaces the next input being edited.
  const refreshPrices = ({ itemId, amounts = true } = {}) => {
    if (!isCurrentView()) return;
    root.querySelector('.quote-feedback').textContent = message;
    const pending = root.querySelector('[data-price-pending]');
    live?.sync();
    pending.hidden = !drafts.size;
    pending.textContent = `${drafts.size} preço(s) aguardando salvamento. Saia do campo para salvar automaticamente; se houver erro, confira o preço na aba Produtos.`;
    if (tab !== 'prices') {
      if (!amounts) return;
      const active = document.activeElement;
      if (!root.contains(active) || active.matches('[data-tab]')) paint(`[data-tab="${tab}"]`);
      return;
    }
    refreshOfferMatrix(root, q, { itemId, drafts, blocked: supplierPending(), amounts });
    winner.sync();
  };
  const winner = useWinnerSelection({
    root, quote: q, choose: chooseProvider, isCurrent: isCurrentView, refresh: refreshPrices,
    setMessage: (value) => { message = value; },
    blockedReason: () => hasSummaryDrafts()
      ? 'Aplique ou cancele as alterações pendentes no Resumo.'
      : discountDrafts.size
        ? 'Salve os descontos pendentes no Comparativo final antes de alterar o vencedor.'
        : drafts.size ? 'Aguarde o salvamento dos preços pendentes antes de escolher um fornecedor.' : '',
  });
  const paint = (focusSelector) => {
    const oldMatrix = root.querySelector('.quote-matrix-wrap');
    if (oldMatrix) matrixScroll = { left: oldMatrix.scrollLeft, top: oldMatrix.scrollTop };
    const finished = q.status === 'finished';
    const count = q.items.filter((i) => q.awards[i.id]).length;
    root.innerHTML =
      `<div class="quote-detail-page" data-quote-detail="${escapeHtml(id)}">${back}<div class="quote-detail-heading">${heading('COTAÇÃO · ' + dateLabel(q.date), escapeHtml(q.title))}</div>` +
      notice + '<p class="quote-pending" data-quote-update role="status" hidden></p>' +
      `${q.notes ? `<p class="quote-observation">${escapeHtml(q.notes)}</p>` : ''}<div class="quote-status-tabs module-tabs" role="tablist" aria-label="Áreas da cotação">${[
        ['summary', 'Resumo'],
        ['prices', 'Produtos'],
        ['providers', 'Fornecedores'],
        ['result', 'Comparativo final'],
      ]
        .map(
          ([key, label]) =>
            `<button type="button" id="quote-tab-${key}" role="tab" aria-controls="quote-detail-panel" data-tab="${key}" aria-selected="${tab === key}" aria-pressed="${tab === key}" tabindex="${tab === key ? '0' : '-1'}">${label}</button>`,
        )
        .join(
          '',
        )}</div><p class="quote-feedback" role="status">${escapeHtml(message)}</p><p class="quote-pending" data-price-pending role="status" ${drafts.size ? '' : 'hidden'}>${drafts.size} preço(s) aguardando salvamento. Saia do campo para salvar automaticamente; se houver erro, confira o preço na aba Produtos.</p><p class="quote-pending" data-discount-pending role="status" ${discountDrafts.size ? '' : 'hidden'}>Há descontos aguardando salvamento. Confira os campos no Comparativo final antes de finalizar.</p>${hasSummaryDrafts() ? '<p class="quote-pending" role="status">Há quantidades ou um produto ainda não aplicados no Resumo. Aplique ou cancele essas alterações antes de escolher fornecedores ou finalizar.</p>' : ''}<div class="quote-detail-body" id="quote-detail-panel" role="tabpanel" aria-labelledby="quote-tab-${tab}"></div></div>`;
    bindQuotationTabs(root, (value) => {
      tab = value;
      paint(`[data-tab="${tab}"]`);
    });
    const body = root.querySelector('.quote-detail-body');
    if (tab === 'summary') {
      body.innerHTML = `<section class="card quote-results"><h2>Resumo da cotação</h2><dl class="quote-overview"><div><dt>Data</dt><dd>${dateLabel(q.date)}</dd></div><div><dt>Produtos</dt><dd>${q.items.length}</dd></div><div><dt>Fornecedores</dt><dd>${q.providers.length}</dd></div><div><dt>Escolhas pendentes</dt><dd>${q.items.length - count}</dd></div></dl><div class="quote-summary-heading"><h2>Produtos e quantidades</h2></div><div class="quote-result-rows">${!q.items.length ? '<p class="quote-explanation">Nenhum produto adicionado. Abra a aba Produtos para montar a lista.</p>' : ''}${q.items.map((item) => `<div class="quote-result-row"><div class="quote-product-identity">${itemPhoto(item)}<div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(unitLabel(item.unit))}</span></div></div>${finished || isQuoteItemFinalized(q, item.id) ? `<div><strong>${item.quantity} ${escapeHtml(unitLabel(item.unit))}</strong></div>` : `<form class="quote-quantity-form" data-item="${item.id}"><label>Quantidade<input name="quantity" inputmode="decimal" value="${escapeHtml(quantityDrafts.get(item.id) ?? item.quantity)}" aria-label="Quantidade de ${escapeHtml(item.name)}" required></label><button type="submit" class="button secondary">Atualizar quantidade</button>${quantityDrafts.has(item.id) ? '<button type="button" class="button secondary discard-quantity">Descartar alteração</button>' : ''}</form>`}</div>`).join('')}</div>${q.providers.length ? `<section class="quote-awarded-summary"><h2>Totais ganhos por fornecedor</h2><p class="quote-explanation">Valores dos produtos escolhidos manualmente para cada fornecedor.</p>${supplierSummaryMarkup(q, { pending: supplierPending() })}</section>` : ''}<button type="button" class="button secondary quote-review-products">${q.items.length ? 'Conferir preços dos produtos' : 'Ir para Produtos'}</button></section>`;
      body.querySelectorAll('.quote-quantity-form input').forEach(
        (input) =>
          (input.oninput = () => {
            quantityDrafts.set(input.form.dataset.item, input.value);
            if (!input.form.querySelector('.discard-quantity')) {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'button secondary discard-quantity';
              button.textContent = 'Descartar alteração';
              button.onclick = async () => {
                quantityDrafts.delete(input.form.dataset.item);
                paint('[data-tab="summary"]');
              };
              input.form.append(button);
            }
          }),
      );
      body.querySelectorAll('.discard-quantity').forEach(
        (button) =>
          (button.onclick = async () => {
            quantityDrafts.delete(button.form.dataset.item);
            paint('[data-tab="summary"]');
          }),
      );
      body.querySelector('.quote-review-products').onclick = () => {
        tab = 'prices';
        paint('[data-tab="prices"]');
      };
      body.querySelectorAll('.quote-quantity-form').forEach(
        (form) =>
          (form.onsubmit = async (event) => {
            event.preventDefault();
            try {
              await updateItemQuantity(q, form.dataset.item, form.elements.quantity.value);
              quantityDrafts.delete(form.dataset.item);
              message = 'Quantidade atualizada. Revise a escolha do fornecedor em Produtos.';
              paint('[data-tab="summary"]');
            } catch (error) {
              root.querySelector('.quote-feedback').textContent = error.message;
            }
          }),
      );
    } else if (tab === 'providers') {
      body.innerHTML = `<section class="card quote-results"><div class="quote-panel-heading"><h2>Fornecedores da cotação</h2>${q.providers.length ? addProviderButton() : ''}</div>${
        q.providers.length
          ? `<div class="quote-provider-list">${q.providers
              .map((p) => {
                const priced = q.items.filter((i) => Number.isInteger(q.offers[i.id]?.[p.id])).length,
                  chosen = q.items.filter((i) => q.awards[i.id] === p.id).length,
                  hasDraft = [...drafts.keys()].some((key) => key.endsWith('|' + p.id)),
                  blocked = q.providers.length <= 1 || isProviderFinalized(q, p.id);
                return `<article class="quote-provider-row"><div><strong>${escapeHtml(p.name)}</strong><span>${priced}/${q.items.length} preços informados · ${chosen} produto(s) escolhido(s)</span>${!finished && blocked ? `<small>${isProviderFinalized(q, p.id) ? 'Fornecedor finalizado.' : 'Mantenha pelo menos um fornecedor nesta cotação.'}</small>` : ''}</div>${!finished ? `<button type="button" class="button secondary remove-provider" data-provider="${p.id}" ${blocked ? 'disabled' : ''}>Remover fornecedor</button>` : ''}</article>`;
              })
              .join('')}</div>`
          : `<div class="quote-panel-empty"><h3>Nenhum fornecedor vinculado</h3><p>Selecione um fornecedor cadastrado ou cadastre um novo aqui mesmo.</p>${addProviderButton()}</div>`
      }</section>`;
      body.querySelectorAll('.remove-provider').forEach(
        (button) =>
          (button.onclick = () => {
            const provider = q.providers.find((item) => item.id === button.dataset.provider);
            if (!provider) return;
            openProviderRemovalDialog({
              host: root,
              provider,
              trigger: button,
              onRemove: () => removeQuoteProvider(q, provider.id, { clearLinked: true }),
              onRemoved: () => {
                for (const key of [...drafts.keys()]) if (key.endsWith('|' + provider.id)) drafts.delete(key);
                message = 'Fornecedor removido. Revise as escolhas pendentes.';
                paint('[data-tab="providers"]');
              },
              onError: (error) => {
                root.querySelector('.quote-feedback').textContent = error.message;
              },
            });
          }),
      );
    } else if (tab === 'prices') {
      if (!q.items.length || !q.providers.length) {
        body.innerHTML = `<section class="card quote-results quote-products-panel"><div class="quote-panel-heading"><h2>Produtos da cotação</h2>${q.items.length ? addProductButton() : ''}</div>${!q.items.length ? `<div class="quote-panel-empty"><h3>Nenhum produto adicionado</h3><p>Escolha os produtos e informe as quantidades para montar a cotação.</p>${addProductButton()}</div>` : `<p class="quote-explanation">Adicione um fornecedor para começar a informar os preços.</p><table class="quote-simple-table"><thead><tr><th>Produto</th><th>Quantidade</th></tr></thead><tbody>${q.items.map((item) => `<tr><th scope="row"><div class="quote-product-identity">${itemPhoto(item)}<div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}</small></div></div></th><td>${item.quantity} ${escapeHtml(unitLabel(item.unit))}</td></tr>`).join('')}</tbody></table><button class="button secondary" type="button" data-open-quote-tab="providers">Ir para Fornecedores</button>`}</section>`;
      } else {
        const { columnWidth, providers: displayProviders } = providerPresentation(q.providers);
        body.innerHTML = `<div class="quote-panel-heading"><h2>Produtos da cotação</h2>${addProductButton()}</div><div class="quote-matrix-wrap" role="region" aria-label="Preços por produto e fornecedor" tabindex="0"><table class="quote-price-matrix" style="min-width:${190 + q.providers.length * columnWidth}px;--quote-provider-width:${columnWidth}px"><caption class="visually-hidden">Produtos nas linhas e fornecedores nas colunas</caption><thead><tr><th scope="col">Produto / quantidade</th>${displayProviders.map((p) => `<th scope="col" title="${escapeHtml(p.name)}" aria-label="${p.code}: ${escapeHtml(p.name)}"><div class="quote-provider-heading" tabindex="0" title="${p.code} · ${escapeHtml(p.name)}" aria-label="${p.code}: ${escapeHtml(p.name)}">${providerDot(p)}<strong class="quote-provider-code">${p.code}</strong><span class="quote-provider-short">${escapeHtml(p.label)}</span></div></th>`).join('')}</tr></thead><tbody>${q.items
          .map((item) => {
            const comparisonData = comparison(q, item.id),
              rowPending = [...drafts.keys()].some((key) => key.startsWith(item.id + '|'));
            return `<tr><th scope="row" class="quote-matrix-product"><div class="quote-product-identity">${itemPhoto(item)}<div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}</small><span>${item.quantity} ${escapeHtml(unitLabel(item.unit))}</span></div></div></th>${q.providers
              .map((p) => {
                const editable = !finished && !isQuoteItemFinalized(q, item.id) && !isProviderFinalized(q, p.id),
                  cents = q.offers[item.id]?.[p.id],
                  has = Number.isInteger(cents),
                  chosen = q.awards[item.id] === p.id,
                  lowest = !rowPending && comparisonData.lowest.includes(p.id),
                  dirty = drafts.has(draftKey(item.id, p.id)),
                  inputValue = dirty
                    ? drafts.get(draftKey(item.id, p.id))
                    : has
                      ? formatBRLCents(cents, MAX_OFFER_CENTS)
                      : '';
                return `<td class="quote-offer ${chosen ? 'chosen' : ''} ${has && lowest && !dirty ? 'is-lowest' : ''}"><div class="offer-top"><div class="offer-badges">${chosen ? `<span class="tag tag-green">${finished ? 'Vencedor' : 'Escolhido'}</span>` : ''}${rowPending ? '<span class="tag">Preço pendente</span>' : has && lowest ? `<span class="tag tag-green">${comparisonData.lowest.length > 1 ? 'Empate' : 'Menor preço'}</span>` : has ? '' : '<span class="tag">Sem preço</span>'}</div>${!finished ? `<button class="button secondary choose-offer" type="button" aria-pressed="${chosen}" aria-label="${chosen ? 'Desmarcar vencedor' : 'Selecionar vencedor'}: ${escapeHtml(p.name)}, ${escapeHtml(item.name)}" title="${chosen ? 'Desmarcar vencedor' : 'Selecionar vencedor'}" data-item="${item.id}" data-provider="${p.id}" ${!has || supplierPending() || !editable ? 'disabled' : ''}>${icon('check')}</button>` : ''}</div><form class="offer-form" data-item="${item.id}" data-provider="${p.id}"><label><span class="quote-currency-prefix" aria-hidden="true">R$</span><input name="price" inputmode="decimal" placeholder="0,00" value="${escapeHtml(inputValue)}" ${editable ? '' : 'disabled'} aria-label="Preço de ${escapeHtml(item.name)} por ${escapeHtml(p.name)}"></label></form><div class="offer-history">${offerHistoryMarkup(q.computed.priceHistory?.[item.id]?.[p.id], { pending: dirty })}</div><p class="offer-draft-note" ${dirty ? '' : 'hidden'}><span class="offer-save-status">Será salvo ao sair do campo.</span></p><p class="offer-total">${has ? `Total <strong>${money(quoteLineTotal(q, item.id, p.id))}</strong>` : '—'}</p></td>`;
              })
              .join('')}</tr>`;
          })
          .join(
            '',
          )}</tbody><tfoot>${matrixTotalsMarkup(q)}</tfoot></table></div><div class="quote-provider-legend" role="group" aria-label="Legenda dos fornecedores"><strong>Fornecedores</strong>${displayProviders.map((p) => `<span class="quote-provider-legend-item">${providerDot(p)}<strong>${p.code}</strong><span>${escapeHtml(p.name)}</span></span>`).join('')}</div>${approvedGrandTotalMarkup(q)}`;
        bindPriceAutosaves({
          body,
          root,
          q,
          id,
          drafts,
          priceDrafts,
          draftKey,
          isCurrentView,
          refreshPrices,
          getMessage: () => message,
          setMessage: (value) => {
            message = value;
          },
        });
        winner.bind();
      }
    } else {
      const totalsData = totals(q),
        min = q.computed.minimumCompleteTotal;
      body.innerHTML =
        !q.items.length || !q.providers.length
          ? `<section class="card quote-results"><h2>Comparativo final</h2><div class="quote-panel-empty"><h3>Monte a cotação para comparar os preços</h3><p>Adicione produtos e fornecedores antes de finalizar a cotação.</p><div class="quote-panel-empty-actions"><button class="button secondary" type="button" data-open-quote-tab="prices">Ver produtos</button><button class="button secondary" type="button" data-open-quote-tab="providers">Ver fornecedores</button></div></div></section>`
          : `${lowestOffersMarkup(q, { itemPhoto, drafts })}<section class="card quote-results"><h2>${count ? 'Produtos ganhos por fornecedor' : 'Escolha dos fornecedores'}</h2>${awardedGroupsMarkup(q, {
              itemPhoto,
              drafts: discountDrafts,
            })}${
              count < q.items.length
                ? `<aside class="quote-pending"><strong>Produtos com escolha pendente</strong><ul>${q.items
                    .filter((item) => !q.awards[item.id])
                    .map(
                      (item) =>
                        `<li>${escapeHtml(item.name)} · ${item.quantity} ${escapeHtml(unitLabel(item.unit))}</li>`,
                    )
                    .join('')}</ul></aside>`
                : ''
            }${count ? `<div class="quote-final-total"><span>Total das escolhas${count < q.items.length ? ' (parcial)' : ''}</span><strong>${money(selectedTotal(q))}</strong></div>` : ''}${finished ? '<p class="quote-explanation">Cotação finalizada.</p>' : `<p class="quote-explanation">${!q.items.length || !q.providers.length ? 'Adicione produtos e fornecedores antes de finalizar a cotação.' : count < q.items.length ? 'Escolha um fornecedor para cada produto antes de finalizar.' : 'Todas as escolhas foram feitas. Revise os preços e finalize a cotação.'}</p><button type="button" class="button primary finish-quote" ${!q.items.length || !q.providers.length || supplierPending() || count < q.items.length ? 'disabled' : ''}>Finalizar cotação</button>`}</section><details class="card quote-results quote-secondary-comparison"><summary>Comparar propostas completas por fornecedor</summary><p class="quote-explanation">Somente propostas com preço para todos os mesmos produtos e quantidades entram na comparação. Valores incompletos não são classificados como mais baratos.</p><div class="quote-total-grid">${totalsData.map((t) => `<div class="quote-total-card"><strong>${escapeHtml(t.name)}</strong><b>${t.complete ? money(t.total) : 'Incompleto'}</b><span>${t.complete ? (t.total === min ? (q.computed.lowestCompleteCount > 1 ? 'Empate no menor total completo' : 'Menor total completo') : 'Total completo') : 'Há produtos sem preço'}</span></div>`).join('')}</div></details>`;
      body.querySelector('.finish-quote')?.addEventListener('click', async () => {
        try {
          if (winner.isPending()) throw Error('Aguarde o salvamento da escolha do fornecedor.');
          if (hasSummaryDrafts()) throw new Error('Aplique ou cancele as alterações pendentes no Resumo.');
          if (drafts.size) throw new Error('Aguarde o salvamento dos preços pendentes antes de finalizar.');
          if (discountDrafts.size) throw new Error('Aguarde o salvamento dos descontos antes de finalizar.');
          await finalizeQuote(q);
          message = 'Cotação finalizada.';
          paint('[data-tab="result"]');
        } catch (error) {
          root.querySelector('.quote-feedback').textContent = error.message;
        }
      });
    }
    bindDiscountAutosaves({
      body,
      root,
      q,
      id,
      discountDrafts,
      summaryDrafts,
      summaryDraft,
      supplierPending,
      count,
      tab,
      isCurrentView,
      refreshPrices,
      getMessage: () => message,
      setMessage: (value) => {
        message = value;
      },
    });
    body.querySelectorAll('[data-finalize-provider]').forEach(
      (button) =>
        (button.onclick = async () => {
          button.disabled = true;
          try {
            if (supplierPending())
              throw Error('Salve ou descarte os preços e quantidades pendentes antes de finalizar.');
            await finalizeQuoteProvider(q, button.dataset.finalizeProvider);
            message = 'Fornecedor finalizado. Os demais fornecedores continuam em andamento.';
            paint(`[data-finalize-provider="${button.dataset.finalizeProvider}"]`);
          } catch (error) {
            if (isCurrentView()) root.querySelector('.quote-feedback').textContent = error.message;
          } finally {
            if (button.isConnected) button.disabled = supplierPending() || isProviderFinalized(q, button.dataset.finalizeProvider);
          }
        }),
    );
    body.querySelectorAll('[data-supplier-pdf]').forEach(
      (button) =>
        (button.onclick = async () => {
          try {
            const provider = q.providers.find((provider) => provider.id === button.dataset.supplierPdf);
            if (!provider) throw Error('Fornecedor não encontrado.');
            if (supplierPending() && !isProviderFinalized(q, provider.id))
              throw Error('Salve ou descarte os preços e quantidades pendentes antes de abrir o PDF.');
            openPdfDialog(
              root,
              { title: `${q.title} - ${provider.name}`, generate: () => generateSupplierQuotePdfs(q, provider.id) },
              button,
            );
          } catch (error) {
            root.querySelector('.quote-feedback').textContent = error.message;
          }
        }),
    );
    root.querySelectorAll('[data-add-quote-product]').forEach((button) =>
      button.addEventListener('click', async (event) => {
        const trigger = event.currentTarget;
        trigger.disabled = true;
        try {
          const products = await loadCatalog();
          if (!root.isConnected) return;
          openQuoteProductDialog({
            host: root,
            products,
            items: q.items,
            draft: addDraft,
            trigger,
            loadPreviews: (rows, options) => readQuotePreviews(rows, options),
            onSubmit: (product, quantity) => {
              if (summaryDrafts.get(id) !== summaryDraft)
                throw Error('A sessão ou empresa mudou. Abra a cotação novamente.');
              return addQuoteItem(q, product, quantity);
            },
            onClose: (reason) => {
              if (reason === 'navigation' || !root.isConnected) return;
              if (reason === 'saved') message = 'Produtos adicionados. Informe os preços na aba Produtos.';
              paint('.quote-add-product-toggle');
            },
          });
        } catch (error) {
          if (root.isConnected) root.querySelector('.quote-feedback').textContent = error.message;
        } finally {
          if (trigger.isConnected) trigger.disabled = false;
        }
      }),
    );
    root.querySelectorAll('[data-open-quote-tab]').forEach(
      (button) =>
        (button.onclick = () => {
          tab = button.dataset.openQuoteTab;
          paint(`[data-tab="${tab}"]`);
        }),
    );
    root.querySelectorAll('[data-add-quote-provider]').forEach(
      (button) =>
        (button.onclick = async () => {
          button.disabled = true;
          try {
            await loadQuoteProviders();
            if (!button.isConnected) return;
            openQuoteProviderDialog({
              host: root,
              items: q.providers,
              trigger: button,
              onSubmit: (provider) => {
                if (summaryDrafts.get(id) !== summaryDraft)
                  throw Error('A sessão ou empresa mudou. Abra a cotação novamente.');
                return addQuoteProvider(q, provider);
              },
              onClose: (reason) => {
                if (reason === 'navigation' || !root.isConnected) return;
                if (reason === 'saved') message = 'Fornecedores adicionados à cotação.';
                paint('[data-add-quote-provider]');
              },
            });
          } catch (error) {
            if (root.isConnected) root.querySelector('.quote-feedback').textContent = error.message;
          } finally {
            if (button.isConnected) button.disabled = false;
          }
        }),
    );
    const matrix = root.querySelector('.quote-matrix-wrap');
    if (matrix) {
      matrix.scrollLeft = matrixScroll.left;
      matrix.scrollTop = matrixScroll.top;
    }
    if (focusSelector) {
      const target = root.querySelector(focusSelector);
      target?.focus({ preventScroll: true });
      if (target?.closest('.quote-matrix-wrap')) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    live?.sync();
    void refreshPhotos().catch((error) => {
      if (root.isConnected)
        root.querySelector('.quote-feedback').textContent = 'Algumas fotos não carregaram. ' + error.message;
    });
  };
  paint();
  live = useDetailRealtime({ root, quote: q, isCurrent: isCurrentView,
    isBusy: () => supplierPending() || Boolean(root.querySelector('dialog[open], [role="dialog"]')),
    apply: (record) => {
      Object.keys(q).forEach((key) => delete q[key]);
      Object.assign(q, record);
      paint(`[data-tab="${tab}"]`);
    },
  });
  view.stop = live.stop;
}

clearOnContextChange('quotes', () => {
  priceDrafts.clear();
  summaryDrafts.clear();
});
