import {heading,escapeHtml} from '../../../shared/ui.js';
import {UNCATEGORIZED,assetFromFile,filterAssets} from './state.js';
import {listAssets,listCategories,addAsset,updateAsset,deleteAsset} from './storage.js';
import {mountCategories,categoryOptions} from './categories.js';
export {listAssets} from './storage.js';
export async function render(root) {
  root.innerHTML=`<link rel="stylesheet" href="./interno/cadastros/catalog.css"><link rel="stylesheet" href="./interno/cadastros/biblioteca-marca/styles.css">${heading('CADASTROS','Biblioteca','Guarde os elementos visuais para reutilizar nos seus encartes.')}<section class="brand-library"><div class="brand-category-manager"></div><form class="card brand-upload"><label>Categoria dos novos arquivos<select name="category"></select></label><label class="brand-file">Adicionar PNGs<input name="files" type="file" accept="image/png,.png" multiple required></label><p>Selecione vários arquivos. Até 8 MB e 20 megapixels por PNG.</p><button class="button primary" type="submit">Salvar PNGs na biblioteca</button></form><div class="brand-filters"><label>Buscar elemento<input class="brand-query" type="search" placeholder="Nome do elemento"></label><label>Categoria<select class="brand-category"><option value="">Todas as categorias</option></select></label></div><p class="brand-status" role="status" aria-live="polite"></p><p class="brand-count"></p><section class="brand-grid" aria-label="Elementos da biblioteca"></section><dialog class="brand-dialog" aria-label="Editar elemento"><form><h2>Editar elemento</h2><p class="brand-edit-status" role="status" aria-live="polite"></p><label>Nome<input name="name" maxlength="100" required></label><label>Categoria<select name="category"></select></label><div><button type="submit" class="button primary">Salvar</button><button type="button" class="button secondary brand-cancel">Cancelar</button></div></form></dialog><dialog class="brand-delete-dialog" aria-label="Excluir elemento"><h2>Excluir elemento?</h2><p class="brand-delete-name"></p><p>Artes que já guardaram uma cópia deste elemento continuam intactas.</p><button class="button primary brand-confirm-delete">Excluir da biblioteca</button><button class="button secondary brand-cancel-delete">Cancelar</button></dialog></section>`;
  let assets=[], categories=[], editingId=null, deletingId=null, busy=false;
  const q=s=>root.querySelector(s), status=text=>{q('.brand-status').textContent=text;};
  const dialog=q('.brand-dialog'), form=dialog.querySelector('form'), deleteDialog=q('.brand-delete-dialog');
  function draw(){
    const rows=filterAssets(assets,q('.brand-query').value,q('.brand-category').value);
    q('.brand-count').textContent=`${rows.length} elemento(s)`;
    q('.brand-grid').innerHTML=rows.length?rows.map(a=>`<article class="card brand-card"><div class="brand-preview"><img src="${a.dataURL}" alt="${escapeHtml(a.name)}" loading="lazy"></div><div class="brand-card-body"><h3>${escapeHtml(a.name)}</h3><p>${escapeHtml(a.category)} · ${a.width} × ${a.height} px</p><div><button class="button secondary brand-edit" data-id="${a.id}" aria-label="Editar ${escapeHtml(a.name)}">Editar</button><button class="button secondary brand-delete" data-id="${a.id}" aria-label="Excluir ${escapeHtml(a.name)}">Excluir</button></div></div></article>`).join(''):'<div class="card brand-empty"><h3>Nenhum elemento encontrado</h3><p>Adicione PNGs na biblioteca ou ajuste os filtros.</p></div>';
    root.querySelectorAll('.brand-edit').forEach(button=>button.onclick=()=>{const a=assets.find(a=>a.id===button.dataset.id);editingId=a.id;q('.brand-edit-status').textContent='';form.elements.name.value=a.name;form.elements.category.value=a.category;dialog.showModal();form.elements.name.focus();});
    root.querySelectorAll('.brand-delete').forEach(button=>button.onclick=()=>{const a=assets.find(a=>a.id===button.dataset.id);deletingId=a.id;q('.brand-delete-name').textContent=a.name;deleteDialog.showModal();q('.brand-cancel-delete').focus();});
  }
  const manager=mountCategories(q('.brand-category-manager'),{getCategories:()=>categories,getAssets:()=>assets,onChange:()=>refresh()});
  const refresh=async()=>{
    [assets,categories]=await Promise.all([listAssets(),listCategories()]);
    const uploadSelect=q('.brand-upload').elements.category, filterSelect=q('.brand-category');
    const selectedUpload=categories.includes(uploadSelect.value)?uploadSelect.value:UNCATEGORIZED;
    const selectedFilter=categories.includes(filterSelect.value)?filterSelect.value:'';
    uploadSelect.innerHTML=categoryOptions(categories,selectedUpload);
    filterSelect.innerHTML='<option value="">Todas as categorias</option>'+categoryOptions(categories,selectedFilter);
    form.elements.category.innerHTML=categoryOptions(categories,form.elements.category.value);
    manager.draw();draw();
  };
  q('.brand-query').oninput=draw;q('.brand-category').onchange=draw;
  q('.brand-cancel').onclick=()=>dialog.close();q('.brand-cancel-delete').onclick=()=>deleteDialog.close();
  q('.brand-upload').onsubmit=async event=>{
    event.preventDefault();if(busy)return;busy=true;
    const upload=event.currentTarget,button=upload.querySelector('[type=submit]'),files=[...upload.elements.files.files],category=upload.elements.category.value;
    button.disabled=true;let saved=0;const errors=[];
    try{for(const file of files){status(`Salvando ${saved + errors.length + 1} de ${files.length}…`);try{await addAsset(await assetFromFile(file,category));saved++;}catch(error){errors.push(`${file.name}: ${error.message}`);}}await refresh();if(saved===files.length)upload.elements.files.value='';status(`${saved} PNG(s) salvo(s).${errors.length?' '+errors.join(' | '):' Disponíveis no editor de encartes.'}`);}catch(error){status(error.message);}finally{busy=false;button.disabled=false;}
  };
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{const a=assets.find(a=>a.id===editingId);if(!a)throw new Error('Elemento não encontrado.');await updateAsset({...a,name:form.elements.name.value,category:form.elements.category.value});dialog.close();await refresh();status('Elemento atualizado.');}catch(error){q('.brand-edit-status').textContent=error.message;}finally{button.disabled=false;}};
  q('.brand-confirm-delete').onclick=async()=>{const button=q('.brand-confirm-delete');button.disabled=true;try{await deleteAsset(deletingId);deleteDialog.close();await refresh();status('Elemento excluído da biblioteca.');}catch(error){deleteDialog.close();status(error.message);}finally{button.disabled=false;}};
  try{await refresh();}catch(error){status(error.message);draw();}
}
