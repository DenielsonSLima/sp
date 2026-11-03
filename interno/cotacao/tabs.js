// Keep keyboard and pointer-selected tabs visible after a detail redraw.
export function revealQuotationTab(event) {
  const tab = event.target;
  if (tab?.matches?.('.quote-status-tabs[role="tablist"] [role="tab"]'))
    tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
}
if (typeof document !== 'undefined') document.addEventListener('focusin', revealQuotationTab);

export function bindQuotationTabs(root, onSelect) {
  const tabs = [...root.querySelectorAll('[data-tab]')];
  tabs.forEach((button, index) => {
    button.onclick = () => onSelect(button.dataset.tab);
    button.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click();
    };
  });
}
