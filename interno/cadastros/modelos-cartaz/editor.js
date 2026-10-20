import {escapeHtml as esc} from '../../../shared/ui.js';
import {SIZES,FONTS,ELEMENTS,defaultTemplates,normalizeTemplate,validateElement,constrainElement,createTemplate,saveTemplate,deleteTemplate,posterMarkup,sampleOffer,paperStyle,elementStyle,dimensionLabel} from './model.js';
import {rulerTicks,centerElement,snapElementToCenter} from './geometry.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const percent=value=>Number((value*100).toFixed(2));
const field=(name,label,min,max,step='any')=>`<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" inputmode="decimal" required></label>`;
function trapFocus(dialog,event){
 if(event.key!=='Tab'||event.defaultPrevented)return;
 const nodes=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length&&!node.closest('[hidden]'));
 const first=nodes[0],last=nodes.at(-1);if(!first)return;
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
export function confirmTemplateDeletion({host,template}){
 return new Promise(resolve=>{
  const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow,parentDialog=host.querySelector('.poster-editor-dialog');
  const modal=document.createElement('dialog');modal.className='poster-discard-dialog';modal.setAttribute('aria-labelledby','poster-delete-title');modal.setAttribute('aria-describedby','poster-delete-description');
  modal.innerHTML=`<h2 id="poster-delete-title">Excluir este modelo?</h2><p id="poster-delete-description">O modelo “${esc(template.name)}” será removido deste navegador. Campanhas já salvas mantêm sua própria cópia.</p><p class="poster-delete-status" role="status"></p><div><button type="button" class="button secondary" data-delete-cancel autofocus>Cancelar</button><button type="button" class="button primary" data-delete-confirm>Excluir modelo</button></div>`;
  host.append(modal);let settled=false;
  const finish=result=>{if(settled)return;settled=true;observer.disconnect();if(modal.open)modal.close();modal.remove();if(!parentDialog||parentDialog.isConnected)document.body.style.overflow=previousOverflow;if(previousFocus?.isConnected)previousFocus.focus();resolve(result);};
  modal.querySelector('[data-delete-cancel]').onclick=()=>finish(null);
  modal.querySelector('[data-delete-confirm]').onclick=()=>{try{finish(deleteTemplate(template.id));}catch(error){modal.querySelector('[role=status]').textContent=error.message;}};
  modal.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();finish(null);});modal.addEventListener('keydown',event=>trapFocus(modal,event));
  const observer=new MutationObserver(()=>{if(!modal.isConnected)finish(null);});observer.observe(document.body,{childList:true,subtree:true});document.body.style.overflow='hidden';modal.showModal();modal.querySelector('[data-delete-cancel]').focus();
 });
}
export function openTemplateEditor({host,template,onSaved,onDeleted}){
 if(host.querySelector('.poster-editor-dialog'))return;
 const creating=!template,opener=document.activeElement;
 let draft=normalizeTemplate(template?clone(template):{...defaultTemplates()[1],id:'new-poster-draft',name:'Novo modelo'}),selected='product',dirty=false,gesture=null,closed=false,confirmation=null,deleting=false,alignmentGuides={vertical:false,horizontal:false},rulerSignature='';
 const dialog=document.createElement('dialog');dialog.className='poster-editor-dialog';dialog.setAttribute('aria-labelledby','poster-editor-title');dialog.setAttribute('aria-describedby','poster-editor-description');
 dialog.innerHTML=`<form class="poster-editor-form"><header class="poster-editor-header"><div><span class="eyebrow">MODELO DE CARTAZ</span><h2 id="poster-editor-title">${creating?'Criar novo modelo':'Editar modelo'}</h2><p id="poster-editor-description">Selecione um elemento para mover, redimensionar e ajustar sua fonte.</p></div><button type="button" class="poster-editor-close" data-close aria-label="Fechar editor">×</button></header><div class="poster-editor-body"><aside class="poster-editor-properties"><section><h3>Folha e aparência</h3><label>Nome do modelo<input name="name" maxlength="60" value="${esc(draft.name)}" required></label><div class="poster-paper-presets" aria-label="Tamanhos iniciais">${Object.entries(SIZES).map(([id,size])=>`<button type="button" data-paper="${id}" aria-label="Usar folha ${size.paper}, ${size.widthMm} por ${size.heightMm} milímetros">${size.paper}</button>`).join('')}</div><div class="poster-editor-fields"><label>Largura (mm)<input name="widthMm" type="text" inputmode="decimal" value="${draft.widthMm}" required></label><label>Altura (mm)<input name="heightMm" type="text" inputmode="decimal" value="${draft.heightMm}" required></label><label>Cor do texto<input name="color" type="color" value="${draft.color}"></label><label>Cor de fundo<input name="background" type="color" value="${draft.background}"></label></div><label>Texto da chamada<textarea name="headline" maxlength="120" rows="2" required>${esc(draft.headline)}</textarea></label><label>Texto do produto<textarea name="productText" maxlength="300" rows="3" required aria-describedby="poster-product-text-help">${esc(draft.productText)}</textarea></label><p class="poster-property-help" id="poster-product-text-help">Mantenha {{produto}} para usar o nome de cada produto. Enter cria uma nova linha. O nome exibido também pode ser ajustado em Promoções.</p></section><section><h3>Elementos do cartaz</h3><div class="poster-element-list" aria-label="Selecionar elemento">${Object.entries(ELEMENTS).map(([key,label])=>`<button type="button" data-select-element="${key}" aria-pressed="${key===selected}">${label}</button>`).join('')}</div><fieldset class="poster-element-properties"><legend>Produto selecionado</legend><button type="button" class="button secondary poster-toggle-element" data-toggle-element>Remover elemento</button><p class="poster-element-visibility" role="status"></p><label>Fonte<select name="fontFamily">${FONTS.map(font=>`<option>${font}</option>`).join('')}</select></label>${field('fontSize','Tamanho da fonte (% da largura útil)',1.5,55)}<div class="poster-editor-fields">${field('letterSpacing','Entre letras (em)',-.1,.5)}${field('lineHeight','Entre linhas',.7,3)}</div><div class="poster-align-controls" aria-label="Alinhamento">${[['left','Esquerda'],['center','Centro'],['right','Direita']].map(([value,label])=>`<button type="button" data-align="${value}" aria-pressed="false">${label}</button>`).join('')}</div><div class="poster-center-controls"><button type="button" class="button secondary" data-center="horizontal">Centralizar na horizontal ↔</button><button type="button" class="button secondary" data-center="vertical">Centralizar na vertical ↕</button></div><div class="poster-editor-fields">${field('x','Posição X (%)',0,92)}${field('y','Posição Y (%)',0,96.5)}${field('w','Largura (%)',8,100)}${field('h','Altura (%)',3.5,100)}</div><p class="poster-property-help">Posições e caixas usam a área útil, com margem de 5 mm. Você também pode usar as setas do teclado no elemento; Shift faz passos maiores.</p></fieldset></section></aside><section class="poster-editor-workarea" aria-label="Prévia visual do modelo"><div class="poster-canvas-toolbar"><strong>Prévia do cartaz</strong><span class="poster-editor-dimensions"></span></div><div class="poster-editor-ruler-frame"><div class="poster-editor-paper"><div class="poster-ruler-corner" aria-hidden="true">mm</div><div class="poster-ruler poster-ruler-top" aria-hidden="true"></div><div class="poster-ruler poster-ruler-left" aria-hidden="true"></div><div class="poster-editor-canvas"><div class="poster-editor-art" aria-hidden="true"></div><div class="poster-alignment-guides" aria-hidden="true"><span class="poster-center-guide poster-center-guide-vertical" hidden></span><span class="poster-center-guide poster-center-guide-horizontal" hidden></span></div><div class="poster-editor-objects">${Object.entries(ELEMENTS).map(([key,label])=>`<div class="poster-object" data-object="${key}" data-label="${label}"><button type="button" class="poster-object-move" data-drag="${key}" aria-label="Selecionar e mover ${label}"></button><button type="button" class="poster-object-resize" data-resize="${key}" aria-label="Redimensionar ${label}" title="Arraste para redimensionar">↘</button></div>`).join('')}</div></div></div></div><p class="poster-canvas-help">As réguas mostram a folha em milímetros. Arraste próximo ao centro para encaixar nas guias. Arraste o elemento. Use a alça ↘ para mudar a caixa e o campo “Tamanho da fonte” para aumentar o texto.</p></section></div><footer class="poster-editor-footer"><div><p class="poster-editor-status" role="status" aria-live="polite"></p><span class="poster-dirty-status">${creating?'Novo modelo':'Sem alterações'}</span></div><div class="poster-editor-actions">${creating?'':'<button class="button secondary poster-delete-model" type="button" data-delete-model>Excluir modelo</button>'}<button class="button secondary" type="button" data-close>Cancelar</button><button class="button primary" type="submit">Salvar modelo</button></div></footer></form>`;
 host.append(dialog);
 const form=dialog.querySelector('form'),status=dialog.querySelector('.poster-editor-status'),canvas=dialog.querySelector('.poster-editor-canvas'),art=dialog.querySelector('.poster-editor-art'),paper=dialog.querySelector('.poster-editor-paper');
 const templateFields=['name','widthMm','heightMm','color','background','headline','productText'],propertyFields=['x','y','w','h','fontSize','fontFamily','letterSpacing','lineHeight'];
 const setDirty=()=>{dirty=true;dialog.querySelector('.poster-dirty-status').textContent='Alterações não salvas';};
 const showError=error=>{status.textContent=error.message;status.classList.add('is-error');};
 const clearError=()=>{status.textContent='';status.classList.remove('is-error');};
 function syncProperties(){
  const element=draft.layout[selected];for(const key of ['x','y','w','h'])form.elements[key].value=percent(element[key]);
  form.elements.fontSize.value=element.fontSize;form.elements.fontFamily.value=element.fontFamily;form.elements.letterSpacing.value=element.letterSpacing;form.elements.lineHeight.value=element.lineHeight;
  dialog.querySelector('[data-toggle-element]').textContent=element.hidden?'Restaurar elemento':'Remover elemento';dialog.querySelector('.poster-element-visibility').textContent=element.hidden?'Elemento removido. Restaure para voltar a exibi-lo.':'';
  dialog.querySelectorAll('[data-center]').forEach(button=>button.disabled=element.hidden);
  dialog.querySelector('legend').textContent=`${ELEMENTS[selected]} selecionado`;
  dialog.querySelectorAll('[data-align]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.align===element.align)));
  dialog.querySelectorAll('[data-select-element]').forEach(button=>{const key=button.dataset.selectElement;button.setAttribute('aria-pressed',String(key===selected));button.textContent=ELEMENTS[key]+(draft.layout[key].hidden?' · removido':'');button.classList.toggle('is-removed',draft.layout[key].hidden);});
  dialog.querySelectorAll('[data-object]').forEach(box=>{const active=box.dataset.object===selected;box.hidden=draft.layout[box.dataset.object].hidden;box.classList.toggle('is-selected',active);box.querySelector('[data-resize]').tabIndex=active?0:-1;box.querySelector('[data-resize]').hidden=!active;box.querySelector('[data-drag]').setAttribute('aria-pressed',String(active));});
 }
 function paintRulers(){
  const rect=paper.getBoundingClientRect();if(!rect.width||!rect.height)return;const signature=[draft.widthMm,draft.heightMm,rect.width.toFixed(1),rect.height.toFixed(1)].join('/');if(signature===rulerSignature)return;rulerSignature=signature;
  for(const [orientation,mm,pixels] of [['top',draft.widthMm,rect.width],['left',draft.heightMm,rect.height]]){
   const axis=orientation==='top'?'left':'top';dialog.querySelector(`.poster-ruler-${orientation}`).innerHTML=rulerTicks(mm,pixels).ticks.map(tick=>`<span class="poster-ruler-tick ${tick.major?'is-major':''} ${tick.edge?'is-'+tick.edge:''}" style="${axis}:${tick.position*100}%">${tick.label?`<b>${tick.mm.toLocaleString('pt-BR',{maximumFractionDigits:1})}</b>`:''}</span>`).join('');
  }
 }
 function paintGuides(){
  const element=draft.layout[selected];
  dialog.querySelector('.poster-center-guide-vertical').hidden=element.hidden||!alignmentGuides.vertical||Math.abs(element.x+element.w/2-.5)>.000001;
  dialog.querySelector('.poster-center-guide-horizontal').hidden=element.hidden||!alignmentGuides.horizontal||Math.abs(element.y+element.h/2-.5)>.000001;
 }
 function paint(){
  paper.style.cssText=`${paperStyle(draft)};--editor-paper-width:${Math.min(430,570*draft.widthMm/draft.heightMm).toFixed(2)}px`;art.innerHTML=posterMarkup(sampleOffer(draft.id),draft);
  dialog.querySelector('.poster-editor-dimensions').textContent=dimensionLabel(draft);
  dialog.querySelectorAll('[data-object]').forEach(box=>box.style.cssText=elementStyle(draft.layout[box.dataset.object]));paintRulers();paintGuides();
 }
 function readProperties(){
  const next={...draft.layout[selected]};for(const key of propertyFields){const value=form.elements[key].value;if(key==='fontFamily')next[key]=value;else{if(value.trim()==='')throw Error('Preencha a posição, o tamanho e a fonte do elemento.');next[key]=Number(value)/(['x','y','w','h'].includes(key)?100:1);}}
  return validateElement(next);
 }
 function applyProperties(){draft.layout[selected]=readProperties();}
 function readTemplate(){const values=Object.fromEntries(templateFields.map(key=>[key,form.elements[key].value]));return normalizeTemplate({...draft,...values});}
 function selectElement(key){
  try{applyProperties();clearError();}catch(error){showError(error);return false;}
  selected=key;alignmentGuides={vertical:false,horizontal:false};syncProperties();paint();return true;
 }
 function closeEditor(){
  if(closed)return;closed=true;observer.disconnect();rulerObserver?.disconnect();window.removeEventListener('resize',paintRulers);confirmation?.close();confirmation?.remove();if(dialog.open)dialog.close();dialog.remove();document.body.style.overflow=previousOverflow;
  if(opener?.isConnected)opener.focus();
 }
 function requestClose(){
  if(confirmation)return;
  if(!dirty){closeEditor();return;}
  const previousFocus=document.activeElement;
  confirmation=document.createElement('dialog');confirmation.className='poster-discard-dialog';confirmation.setAttribute('aria-labelledby','poster-discard-title');confirmation.setAttribute('aria-describedby','poster-discard-description');
  confirmation.innerHTML='<h2 id="poster-discard-title">Descartar alterações?</h2><p id="poster-discard-description">O modelo ainda não foi salvo. Você pode continuar editando sem perder suas mudanças.</p><div><button type="button" class="button secondary" data-keep autofocus>Continuar editando</button><button type="button" class="button primary" data-discard>Descartar alterações</button></div>';
  host.append(confirmation);
  const keep=()=>{confirmation.close();confirmation.remove();confirmation=null;if(previousFocus?.isConnected)previousFocus.focus();};
  confirmation.querySelector('[data-keep]').onclick=keep;confirmation.querySelector('[data-discard]').onclick=()=>{confirmation.close();confirmation.remove();confirmation=null;closeEditor();};
  confirmation.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();keep();});confirmation.addEventListener('keydown',event=>trapFocus(confirmation,event));confirmation.showModal();confirmation.querySelector('[data-keep]').focus();
 }
 function toggleElement(){
  try{applyProperties();draft.layout[selected].hidden=!draft.layout[selected].hidden;setDirty();clearError();syncProperties();paint();dialog.querySelector('[data-toggle-element]').focus();}catch(error){showError(error);}
 }
 dialog.querySelector('[data-toggle-element]').onclick=toggleElement;
 dialog.querySelectorAll('[data-center]').forEach(button=>button.onclick=()=>{try{applyProperties();draft.layout[selected]=centerElement(draft.layout[selected],button.dataset.center);alignmentGuides={vertical:button.dataset.center==='horizontal',horizontal:button.dataset.center==='vertical'};setDirty();clearError();syncProperties();paint();status.textContent=`${ELEMENTS[selected]} centralizado ${button.dataset.center==='horizontal'?'na horizontal':'na vertical'}.`;}catch(error){showError(error);}});
 const deleteButton=dialog.querySelector('[data-delete-model]');if(deleteButton)deleteButton.onclick=async()=>{if(deleting)return;deleting=true;const removed=await confirmTemplateDeletion({host,template:draft});deleting=false;if(removed){closeEditor();onDeleted?.(removed);}};
 dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=requestClose);
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();requestClose();});
 dialog.addEventListener('keydown',event=>trapFocus(dialog,event));
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)requestClose();});
 dialog.querySelectorAll('[data-select-element]').forEach(button=>button.onclick=()=>selectElement(button.dataset.selectElement));
 dialog.querySelectorAll('[data-paper]').forEach(button=>button.onclick=()=>{const size=SIZES[button.dataset.paper];form.elements.widthMm.value=size.widthMm;form.elements.heightMm.value=size.heightMm;setDirty();try{draft=readTemplate();clearError();paint();}catch(error){showError(error);}});
 for(const key of templateFields)form.elements[key].addEventListener('input',()=>{setDirty();try{draft=readTemplate();clearError();paint();}catch(error){showError(error);}});
 for(const key of propertyFields)form.elements[key].addEventListener(key==='fontFamily'?'change':'input',()=>{setDirty();try{applyProperties();clearError();paint();}catch(error){showError(error);}});
 dialog.querySelectorAll('[data-align]').forEach(button=>button.onclick=()=>{try{applyProperties();draft.layout[selected].align=button.dataset.align;setDirty();clearError();syncProperties();paint();}catch(error){showError(error);}});
 const objects=dialog.querySelector('.poster-editor-objects');
 objects.addEventListener('pointerdown',event=>{
  const button=event.target.closest('[data-drag],[data-resize]');if(!button||event.button!==0||gesture)return;
  const key=button.dataset.drag||button.dataset.resize;if(!selectElement(key))return;
  event.preventDefault();button.focus({preventScroll:true});const rect=canvas.getBoundingClientRect();
  gesture={pointerId:event.pointerId,button,startX:event.clientX,startY:event.clientY,width:rect.width,height:rect.height,initial:clone(draft.layout[selected]),key,resizing:!!button.dataset.resize,wasDirty:dirty};button.setPointerCapture(event.pointerId);
 });
 objects.addEventListener('pointermove',event=>{
  if(!gesture||gesture.pointerId!==event.pointerId)return;event.preventDefault();
  const g=gesture,dx=(event.clientX-g.startX)/g.width,dy=(event.clientY-g.startY)/g.height;
  const change=g.resizing?{w:Math.min(1-g.initial.x,g.initial.w+dx),h:Math.min(1-g.initial.y,g.initial.h+dy)}:{x:g.initial.x+dx,y:g.initial.y+dy};
  const moved=constrainElement(g.initial,change);if(g.resizing){draft.layout[g.key]=moved;alignmentGuides={vertical:false,horizontal:false};}else{const rect=canvas.getBoundingClientRect(),snapped=snapElementToCenter(moved,{widthPx:rect.width,heightPx:rect.height});draft.layout[g.key]=snapped.element;alignmentGuides=snapped.guides;}setDirty();syncProperties();paint();
 });
 function endGesture(event,cancel=false){
  if(!gesture||event.pointerId!==gesture.pointerId)return;const g=gesture;gesture=null;
  if(cancel){draft.layout[g.key]=g.initial;dirty=g.wasDirty;dialog.querySelector('.poster-dirty-status').textContent=dirty?'Alterações não salvas':creating?'Novo modelo':'Sem alterações';syncProperties();paint();}
  alignmentGuides={vertical:false,horizontal:false};paintGuides();if(g.button.hasPointerCapture(event.pointerId))g.button.releasePointerCapture(event.pointerId);
 }
 objects.addEventListener('pointerup',event=>endGesture(event));objects.addEventListener('pointercancel',event=>endGesture(event,true));objects.addEventListener('lostpointercapture',event=>endGesture(event));
 objects.addEventListener('click',event=>{const button=event.target.closest('[data-drag],[data-resize]');if(button)selectElement(button.dataset.drag||button.dataset.resize);});
 objects.addEventListener('keydown',event=>{
  const button=event.target.closest('[data-drag],[data-resize]');if(!button)return;if(['Delete','Backspace'].includes(event.key)){event.preventDefault();if(selectElement(button.dataset.drag||button.dataset.resize))toggleElement();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();if(!selectElement(button.dataset.drag||button.dataset.resize))return;
  const step=event.shiftKey?.02:.005,delta=['ArrowLeft','ArrowUp'].includes(event.key)?-step:step,e=draft.layout[selected],horizontal=['ArrowLeft','ArrowRight'].includes(event.key);
  const key=button.dataset.resize?(horizontal?'w':'h'):(horizontal?'x':'y');const value=e[key]+delta;draft.layout[selected]=constrainElement(e,{[key]:button.dataset.resize?Math.min(value,1-e[horizontal?'x':'y']):value});setDirty();syncProperties();paint();
 });
 form.onsubmit=event=>{event.preventDefault();try{applyProperties();draft=readTemplate();const saved=creating?createTemplate(draft):saveTemplate(draft.id,draft);dirty=false;closeEditor();onSaved(saved);}catch(error){showError(error);}};
 const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const observer=new MutationObserver(()=>{if(!dialog.isConnected)closeEditor();});observer.observe(document.body,{childList:true,subtree:true});
 const rulerObserver=typeof ResizeObserver==='function'?new ResizeObserver(paintRulers):null;rulerObserver?.observe(paper);window.addEventListener('resize',paintRulers);
 syncProperties();paint();dialog.showModal();paintRulers();form.elements.name.focus();
}
