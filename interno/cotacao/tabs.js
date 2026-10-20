// Keep keyboard and pointer-selected tabs visible after a detail redraw.
export function revealQuotationTab(event){
 const tab=event.target;
 if(tab?.matches?.('.quote-status-tabs[role="tablist"] [role="tab"]'))
  tab.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'instant'});
}
if(typeof document!=='undefined')document.addEventListener('focusin',revealQuotationTab);
