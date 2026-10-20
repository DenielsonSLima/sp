import {heading,escapeHtml as esc} from '../../../shared/ui.js';
import {templates,miniMarkup,dimensionLabel,storageWarning} from './model.js';
import {openTemplateEditor} from './editor.js';
export async function render(root){
 root.innerHTML=`<link rel="stylesheet" href="./interno/cadastros/modelos-cartaz/styles.css">${heading('CADASTROS','Modelos de cartaz','Crie o visual das suas ofertas e reutilize seus modelos em Promoções.')}<div class="poster-toolbar"><p>Todos em retrato · um cartaz por folha</p><div class="poster-gallery-actions"><a class="button secondary" href="#promocoes">Abrir Promoções →</a><button class="button primary" type="button" data-create-template>+ Criar novo</button></div></div><p class="poster-gallery-status" role="status" aria-live="polite">${esc(storageWarning)}</p><section class="poster-template-grid" aria-label="Modelos disponíveis"></section><p class="poster-note">Clique em um modelo para editar. Os modelos ficam salvos neste navegador. As medidas iniciais são A6, A5 e A4, com largura e altura personalizáveis. Na impressão, selecione o papel correspondente, escala 100%, sem cabeçalhos e rodapés, e habilite gráficos de fundo.</p>`;
 const gallery=root.querySelector('.poster-template-grid'),status=root.querySelector('.poster-gallery-status');
 function edit(template){openTemplateEditor({host:root,template,onSaved:saved=>{paintGallery();status.textContent=`Modelo “${saved.name}” salvo neste navegador e disponível em Promoções.`;gallery.querySelector(`[data-template-id="${saved.id}"]`)?.focus();}});}
 function paintGallery(){
  gallery.innerHTML=templates.map(t=>`<button type="button" class="card poster-template" data-template-id="${esc(t.id)}" aria-label="Editar modelo ${esc(t.name)}, ${esc(dimensionLabel(t))}"><span class="poster-template-title"><strong>${esc(t.name)}</strong><span>${esc(dimensionLabel(t))}</span></span><span class="poster-mini-preview" aria-hidden="true">${miniMarkup(t)}</span><span class="poster-template-footer"><span>4 elementos personalizáveis</span><b>Editar modelo ↗</b></span></button>`).join('');
  gallery.querySelectorAll('[data-template-id]').forEach(button=>button.onclick=()=>edit(templates.find(t=>t.id===button.dataset.templateId)));
 }
 root.querySelector('[data-create-template]').onclick=()=>edit();paintGallery();
}
