import { attachOfferInput, MAX_OFFER_CENTS } from './offer-input.js';
import { formatBRLCents } from '../../shared/components/currency-input/index.js';
import { attachDiscountForm, refreshAwardAmounts, discountKey } from './award-groups.js';
import { setOffer, setQuoteDiscount, awardedByProvider, isProviderFinalized } from './state.js';

/** Bind field autosaves independently from painting the current detail view. */
export function bindPriceAutosaves({
  body,
  root,
  q,
  id,
  drafts,
  priceDrafts,
  draftKey,
  isCurrentView,
  refreshPrices,
  getMessage,
  setMessage,
}) {
  body.querySelectorAll('.offer-form input').forEach((input) => {
    const form = input.form;
    const { item, provider } = form.dataset;
    const key = draftKey(item, provider);
    const cents = q.offers[item]?.[provider];
    const card = form.closest('.quote-offer');
    const showStatus = (text) => {
      if (!isCurrentView()) return;
      const current = root.querySelector(`.offer-form[data-item="${item}"][data-provider="${provider}"]`);
      const note = current?.closest('.quote-offer').querySelector('.offer-draft-note');
      if (note) {
        note.hidden = false;
        note.querySelector('.offer-save-status').textContent = text;
      }
    };
    attachOfferInput(input, {
      savedValue: Number.isInteger(cents) ? formatBRLCents(cents, MAX_OFFER_CENTS) : '',
      save: (value) => {
        if (priceDrafts.get(id) !== drafts) throw Error('A sessão ou empresa mudou. Abra a cotação novamente.');
        return setOffer(q, item, provider, value);
      },
      onDraft: (value) => {
        const newlyPending = !drafts.has(key);
        drafts.set(key, value);
        setMessage('');
        card.querySelector('.offer-draft-note').hidden = false;
        card.querySelector('.offer-save-status').textContent = 'Será salvo ao sair do campo.';
        if (newlyPending) refreshPrices({ itemId: item, amounts: false });
      },
      onSaving: () => showStatus('Salvando…'),
      onSaved: (value) => {
        if (!drafts.has(key)) return;
        if (drafts.get(key) === value) drafts.delete(key);
        if (!isCurrentView()) return;
        setMessage('Preço salvo automaticamente.');
        refreshPrices({ itemId: item });
      },
      onError: (error) => {
        if (!isCurrentView()) return;
        setMessage('Preço não salvo. ' + error.message);
        showStatus('Não salvo. Saia do campo ou pressione Enter para tentar novamente.');
        root.querySelector('.quote-feedback').textContent = getMessage();
      },
    });
  });
}

export function bindDiscountAutosaves({
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
  getMessage,
  setMessage,
}) {
  const refreshDiscounts = ({ amounts = true } = {}) => {
    if (!isCurrentView()) return;
    root.querySelector('.quote-feedback').textContent = getMessage();
    const pending = root.querySelector('[data-discount-pending]');
    if (pending) pending.hidden = !discountDrafts.size;
    for (const form of root.querySelectorAll('.quote-discount-form')) {
      const note = form.querySelector('.quote-discount-status');
      note.hidden = !discountDrafts.has(discountKey(form.dataset.provider, form.dataset.item));
    }
    const finish = root.querySelector('.finish-quote');
    if (finish) finish.disabled = supplierPending() || count < q.items.length;
    for (const button of root.querySelectorAll('[data-finalize-provider]')) {
      const group = awardedByProvider(q).find((p) => p.id === button.dataset.finalizeProvider);
      button.disabled = !group?.items.length || supplierPending() || q.status === 'finished' || isProviderFinalized(q, button.dataset.finalizeProvider);
    }
    for (const button of root.querySelectorAll('[data-supplier-pdf]')) {
      const group = awardedByProvider(q).find((p) => p.id === button.dataset.supplierPdf);
      button.disabled = !group?.items.length || (supplierPending() && !isProviderFinalized(q, button.dataset.supplierPdf));
    }
    if (root.querySelector('[data-award-provider]')) {
      if (amounts) refreshAwardAmounts(root, q);
    } else refreshPrices({ amounts });
  };
  body.querySelectorAll('.quote-discount-form').forEach((form) => {
    if (form.elements.discount.disabled) return;
    const { provider, item } = form.dataset,
      key = discountKey(provider, item);
    const group = awardedByProvider(q).find((p) => p.id === provider);
    const spec = item ? group.items.find((row) => row.id === item).discount : group.discount;
    const saved = { type: spec?.type || 'amount', value: formatBRLCents(spec?.value ?? 0, MAX_OFFER_CENTS) };
    const status = (text) => {
      if (!isCurrentView()) return;
      const current = root.querySelector(
        `.quote-discount-form[data-provider="${provider}"][data-item="${item}"] .quote-discount-status`,
      );
      if (current) {
        current.hidden = false;
        current.textContent = text;
      }
    };
    attachDiscountForm(form, {
      saved,
      onDraft: (value) => {
        const newlyPending = !discountDrafts.has(key);
        discountDrafts.set(key, value);
        setMessage('');
        status('Será salvo ao sair do campo.');
        if (newlyPending) refreshDiscounts({ amounts: false });
      },
      save: (type, value) => {
        if (summaryDrafts.get(id) !== summaryDraft) throw Error('A sessão ou empresa mudou. Abra a cotação novamente.');
        return setQuoteDiscount(q, provider, item || null, type, value);
      },
      onSaving: () => status('Salvando…'),
      onSaved: (value) => {
        if (!discountDrafts.has(key)) return;
        const draft = discountDrafts.get(key);
        if (draft.type === value.type && draft.value === value.value) discountDrafts.delete(key);
        setMessage('Desconto salvo automaticamente.');
        refreshDiscounts();
      },
      onError: (error) => {
        if (!isCurrentView()) return;
        setMessage('Desconto não salvo. ' + error.message);
        status('Não salvo. Corrija o desconto e saia do campo para tentar novamente.');
        root.querySelector('.quote-feedback').textContent = getMessage();
      },
    });
  });
}
