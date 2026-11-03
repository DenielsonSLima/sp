// Explicit legacy visual fixture, excluded from application builds.
import {fillTemplateProducts} from './flyer-layered-templates.js';
import {escapeHtml} from '../../../shared/ui.js';
import {createDesign} from '../../../interno/encartes/model.js';
import {templates,applyTemplate} from './flyer-templates.js';
import {renderDesign} from '../../../interno/encartes/renderer.js';
const formats=[['portrait','Post retrato',1080,1350],['square','Post quadrado',1080,1080],['story','Story',1080,1920]];
const fold=value=>value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const state={query:'',count:'',format:'portrait'};
export function templateDesign(design,id,catalog=[]){
 const template=templates.find(t=>t.id===id);
 const result=applyTemplate(design,id);
 return template?.category?fillTemplateProducts(result,catalog,{category:template.category}):result;
}
export function renderTemplateGallery(root,{onChoose,onBlank,catalog=[]}){
 root.innerHTML=`<section class="card flyer-model-filters"><label>Buscar modelo<input type="search" name="templateSearch" placeholder="Destaque, festival..." value="${escapeHtml(state.query)}"></label><label>Produtos<select name="templateCount"><option value="">Todos os modelos</option>${[1,3,4,6,9].map(n=>`<option value="${n}" ${state.count===String(n)?'selected':''}>${n} produto${n===1?'':'s'}</option>`).join('')}</select></label><label>Formato<select name="templateFormat">${formats.map(([id,label])=>`<option value="${id}" ${state.format===id?'selected':''}>${label}</option>`).join('')}</select></label><button class="button secondary model-blank" type="button">＋ Começar em branco</button></section><div class="flyer-model-grid"></div>`;
 const dimensions=()=>formats.find(f=>f[0]===state.format);const fresh=()=>{const f=dimensions();return createDesign({width:f[2],height:f[3]});};
 root.querySelector('.model-blank').onclick=()=>onBlank(fresh());
 let generation=0;
 const paint=()=>{const token=++generation;const rows=[...templates].sort((a,b)=>Number(Boolean(b.category))-Number(Boolean(a.category))).filter(t=>(!state.count||t.productCount===Number(state.count))&&fold(t.name).includes(fold(state.query)));const grid=root.querySelector('.flyer-model-grid');grid.innerHTML=rows.length?rows.map(t=>`<article class="card flyer-model-card"><button class="flyer-model-preview" type="button" data-template="${t.id}" aria-label="Usar modelo ${escapeHtml(t.name)}"><canvas aria-hidden="true"></canvas><span>Usar este modelo →</span></button><div class="flyer-model-description"><span class="tag">${t.productCount===1?'PRODUTO ÚNICO':t.productCount+' PRODUTOS'}</span><h3>${escapeHtml(t.name)}</h3><p>${escapeHtml(t.description)}</p><small>${dimensions()[2]} × ${dimensions()[3]} px</small></div></article>`).join(''):'<section class="card flyer-empty-library"><h2>Nenhum modelo encontrado.</h2><p>Altere a busca ou a quantidade de produtos.</p></section>';grid.querySelectorAll('[data-template]').forEach(button=>{const id=button.dataset.template;const template=templates.find(t=>t.id===id);button.onclick=()=>onChoose(templateDesign(fresh(),id,catalog));const preview=fillTemplateProducts(applyTemplate(fresh(),id),catalog,{preview:true,category:template.category});preview.elements.filter(e=>e.type==='product').forEach((e,i)=>{if(e.placeholder)e.name='Produto '+(i+1);e.priceText='R$ 9,99';});const canvas=button.querySelector('canvas');renderDesign(canvas,preview,{scale:360/preview.width}).catch(()=>{if(token===generation&&canvas.isConnected)canvas.replaceWith(document.createTextNode('Prévia indisponível'));});});};
 root.querySelector('[name=templateSearch]').oninput=e=>{state.query=e.target.value;paint();};root.querySelector('[name=templateCount]').onchange=e=>{state.count=e.target.value;paint();};root.querySelector('[name=templateFormat]').onchange=e=>{state.format=e.target.value;paint();};paint();
}
