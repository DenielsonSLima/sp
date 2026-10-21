import {escapeHtml as esc} from '../../shared/ui.js';
import {awardedByProvider,totals,money,selectedTotal,isProviderFinalized} from './state.js';
import {providerPresentation,providerDot} from './presentation.js';

export function supplierSummaryRows(q){
 const proposed=new Map(totals(q).map(provider=>[provider.id,provider]));
 const badges=new Map(providerPresentation(q.providers).providers.map(provider=>[provider.id,provider]));
 return awardedByProvider(q).map(provider=>({...provider,...badges.get(provider.id),proposed:proposed.get(provider.id),finalized:provider.items.length>0&&(q.status==='finished'||isProviderFinalized(q,provider.id))}));
}

export function supplierActionsMarkup(provider,{pending=false}={}){
 const noItems=!provider.items.length;
 const pdfBlocked=noItems||(pending&&!provider.finalized);
 const finishBlocked=noItems||pending||provider.finalized;
 return `<div class="quote-supplier-actions"><button type="button" class="button secondary" data-supplier-pdf="${esc(provider.id)}" aria-label="PDF de ${esc(provider.name)}" ${pdfBlocked?'disabled':''}>PDF</button><button type="button" class="button ${provider.finalized?'secondary':'primary'}" data-finalize-provider="${esc(provider.id)}" aria-label="${provider.finalized?'Fornecedor finalizado':'Finalizar fornecedor'} ${esc(provider.name)}" ${finishBlocked?'disabled':''}>${provider.finalized?'Finalizado':'Finalizar'}</button></div>`;
}

export function supplierSummaryMarkup(q,{pending=false}={}){
 return `<ul class="quote-supplier-summary">${supplierSummaryRows(q).map(provider=>`<li class="quote-supplier-summary-row"><div class="quote-supplier-summary-name">${providerDot(provider)}<div><strong>${esc(provider.name)}</strong><small>${provider.finalized?'Finalizado':provider.items.length?'Em andamento':'Sem produtos aprovados'}</small></div></div><div class="quote-supplier-summary-stat"><span>Produtos aprovados</span><strong>${provider.items.length}</strong></div><div class="quote-supplier-summary-stat"><span>Total cotado${provider.proposed.complete?'':' (parcial)'}</span><strong>${money(provider.proposed.subtotal)}</strong>${!provider.proposed.complete?'<small>Há produtos sem preço</small>':''}</div><div class="quote-supplier-summary-stat"><span>Total aprovado</span><strong>${money(provider.total)}</strong></div>${supplierActionsMarkup(provider,{pending})}</li>`).join('')}</ul>${approvedGrandTotalMarkup(q)}`;
}

export function approvedGrandTotalMarkup(q){
 const approved=q.items.filter(item=>q.awards[item.id]).length;
 return `<div class="quote-approved-grand-total"><div><strong>Total geral aprovado</strong><span>${approved} de ${q.items.length} produto(s) aprovado(s)</span></div><strong>${money(selectedTotal(q))}</strong></div>`;
}

export function matrixTotalsMarkup(q){
 return `<tr class="quote-proposed-totals"><th scope="row">Total cotado</th>${totals(q).map(provider=>`<td><strong>${money(provider.subtotal)}</strong><small>${provider.complete?'Todos os produtos cotados':'Parcial - há produtos sem preço'}</small></td>`).join('')}</tr><tr class="quote-approved-totals"><th scope="row">Total aprovado</th>${awardedByProvider(q).map(provider=>`<td><strong>${money(provider.total)}</strong><small>${provider.items.length} produto(s) aprovado(s)</small></td>`).join('')}</tr>`;
}
