/** Keep the acknowledgement local to the row; never rebuild inputs/photos on a winner click. */
export function useWinnerSelection({ root, quote, choose, blockedReason, isCurrent, refresh, setMessage }) {
  let pending = null;
  const sync = () => {
    if (!isCurrent()) return;
    for (const button of root.querySelectorAll('.choose-offer')) {
      const saving = pending?.item === button.dataset.item && pending?.provider === button.dataset.provider;
      button.setAttribute('aria-busy', String(Boolean(saving)));
      button.classList.toggle('is-saving', Boolean(saving));
      if (pending) button.disabled = true;
    }
  };
  const select = async (button) => {
    if (pending || !isCurrent() || button.disabled) return;
    const reason = blockedReason();
    if (reason) {
      setMessage(reason);
      refresh({ amounts: false });
      return;
    }
    const { item, provider } = button.dataset;
    pending = { item, provider };
    setMessage('Salvando escolha do fornecedor…');
    refresh({ itemId: item, amounts: false });
    sync();
    try {
      await choose(quote, item, quote.awards[item] === provider ? null : provider);
      if (isCurrent()) setMessage('Escolha manual atualizada.');
    } catch (error) {
      if (isCurrent()) setMessage(error.message || 'Não foi possível salvar a escolha. Tente novamente.');
    } finally {
      pending = null;
      if (isCurrent()) {
        refresh({ itemId: item });
        sync();
      }
    }
  };
  return {
    isPending: () => pending !== null,
    sync,
    bind() {
      for (const button of root.querySelectorAll('.choose-offer')) button.onclick = () => select(button);
      sync();
    },
  };
}
