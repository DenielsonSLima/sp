import {escapeHtml} from '../../shared/ui.js';
import {normalizeSearch} from '../../shared/filters.js';
import {unitLabel} from '../cadastros/unidades/state.js';
import {quoteProductPhoto} from './presentation.js';

export function openQuoteProductDialog({host,products,items,draft,trigger,onSubmit,onClose=()=>{}}){
 const existing=host.querySelector('.quote-product-dialog');
 if(existing)return existing;
 const available=products.filter(product=>!items.some(item=>item.productId===product.id));
 const dialog=document.createElement('dialog');
 const events=new AbortController();
 let settled=false;
 const previousOverflow=document.body.style.overflow;
 draft.open=true;
 dialog.className='quote-product-dialog';
 dialog.setAttribute('aria-labelledby','quote-product-dialog-title');
 dialog.setAttribute('aria-describedby','quote-product-dialog-description');
 dialog.innerHTML=`<form class="quote-add-product"><header class="quote-product-dialog-heading"><div><h2 id="quote-product-dialog-title">Adicionar produto à cotação</h2><p id="quote-product-dialog-description">Selecione um produto e informe a quantidade.</p></div><button type="button" class="quote-product-dialog-close" data-close aria-label="Fechar seleção de produto">×</button></header><label class="quote-product-search">Buscar produto<input type="search" data-search placeholder="Nome, código ou categoria" value="${escapeHtml(draft.query||'')}"></label><fieldset class="quote-product-options"><legend class="visually-hidden">Produtos disponíveis</legend><div class="quote-product-picker"></div></fieldset><label class="quote-product-quantity">Quantidade<input name="quantity" inputmode="decimal" value="${escapeHtml(draft.quantity)}" required></label><p class="quote-error" role="alert"></p><footer class="quote-product-dialog-actions"><button type="button" class="button secondary cancel-add-product" data-cancel>Cancelar</button><button type="submit" class="button primary" ${available.length?'':'disabled'}>Adicionar produto</button></footer></form>`;
 const form=dialog.querySelector('form'),search=dialog.querySelector('[data-search]'),quantity=form.elements.quantity;
 const capture=()=>{
  const selected=dialog.querySelector('[name=product]:checked');
  if(selected)draft.product=selected.value;
  draft.quantity=quantity.value;
  draft.query=search.value;
 };
 const draw=()=>{
  const needle=normalizeSearch(draft.query);
  const rows=available.filter(product=>product.id===draft.product||normalizeSearch(`${product.name} ${product.code||''} ${product.category}`).includes(needle));
  dialog.querySelector('.quote-product-picker').innerHTML=rows.length?rows.map(product=>`<label class="quote-product-option"><input type="radio" name="product" value="${escapeHtml(product.id)}" ${draft.product===product.id?'checked':''} required>${quoteProductPhoto(product)}<span class="quote-product-option-text"><strong>${escapeHtml(product.name)}</strong><small>${product.code?`Cód. ${escapeHtml(product.code)} · `:''}${escapeHtml(product.category)} · ${escapeHtml(unitLabel(product.unit))}</small></span></label>`).join(''):`<p class="quote-product-empty">${available.length?'Nenhum produto encontrado para essa busca.':'Todos os produtos cadastrados já estão na cotação.'}</p>`;
 };
 const finish=reason=>{
  if(settled)return;
  capture();
  settled=true;
  events.abort();
  if(reason==='navigation')draft.open=Boolean(draft.product||draft.quantity!=='1');
  else Object.assign(draft,{open:false,product:'',quantity:'1',query:''});
  if(dialog.open)dialog.close();
  dialog.remove();
  document.body.style.overflow=previousOverflow;
  if(reason!=='navigation'&&trigger?.isConnected)trigger.focus({preventScroll:true});
  onClose(reason);
 };
 dialog.querySelector('[data-close]').onclick=()=>finish('cancel');
 dialog.querySelector('[data-cancel]').onclick=()=>finish('cancel');
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();finish('cancel');});
 dialog.addEventListener('close',()=>finish('cancel'));
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const rect=dialog.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)finish('cancel');
 });
 form.addEventListener('input',capture);
 form.addEventListener('change',capture);
 search.oninput=()=>{capture();draw();};
 form.onsubmit=event=>{
  event.preventDefault();capture();
  try{
   const product=available.find(product=>product.id===draft.product);
   if(!product)throw new Error('Selecione um produto cadastrado.');
   onSubmit(product,draft.quantity);
   finish('saved');
  }catch(error){dialog.querySelector('.quote-error').textContent=error.message;}
 };
 window.addEventListener('hashchange',()=>finish('navigation'),{signal:events.signal});
 host.append(dialog);draw();document.body.style.overflow='hidden';dialog.showModal();search.focus();
 return dialog;
}
