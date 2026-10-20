import {escapeHtml as esc} from '../../../shared/ui.js';

export const SIZES=Object.freeze({small:{label:'Pequeno',paper:'A6',widthMm:105,heightMm:148,count:1},medium:{label:'Médio',paper:'A5',widthMm:148,heightMm:210,count:1},large:{label:'Grande',paper:'A4',widthMm:210,heightMm:297,count:1}});
export const FONTS=Object.freeze(['Arial','Verdana','Georgia','Impact','Trebuchet MS']);
export const ELEMENTS=Object.freeze({headline:'Chamada',product:'Produto',price:'Preço',validity:'Validade'});
export const STORAGE_KEY='supermercado-poster-templates-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const own=(object,key)=>Object.hasOwn(object,key);
const number=(value,label)=>{if(value===''||value===null||typeof value==='boolean'||!Number.isFinite(Number(value)))throw Error(`${label} inválido.`);return Number(value);};
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id)&&!['__proto__','constructor','prototype','toString'].includes(id);
export const TEXT_DEFAULTS=Object.freeze({headline:{letterSpacing:.1,lineHeight:1.1},product:{letterSpacing:0,lineHeight:1.08},price:{letterSpacing:0,lineHeight:1},validity:{letterSpacing:0,lineHeight:1.4}});
export function defaultLayout(font='Arial'){
 const layout={headline:{x:.05,y:.02,w:.9,h:.1,fontSize:4,fontFamily:font,align:'center'},product:{x:.04,y:.17,w:.92,h:.25,fontSize:8.5,fontFamily:font,align:'center'},price:{x:.04,y:.43,w:.92,h:.36,fontSize:29,fontFamily:font,align:'center'},validity:{x:.04,y:.86,w:.92,h:.1,fontSize:2.5,fontFamily:font,align:'center'}};
 return Object.fromEntries(Object.entries(layout).map(([key,value])=>[key,{...value,hidden:false,...TEXT_DEFAULTS[key]}]));
}
export function validateElement(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Elemento inválido.');
 const item={};for(const key of ['x','y','w','h','fontSize'])item[key]=number(input[key],key==='fontSize'?'Tamanho da fonte':'Posição ou tamanho');
 if(item.x<0||item.y<0||item.w<.08||item.h<.035||item.x+item.w>1.000001||item.y+item.h>1.000001)throw Error('Mantenha o elemento dentro da folha. Largura mínima: 8%; altura mínima: 3,5%.');
 if(item.fontSize<1.5||item.fontSize>55)throw Error('Use fonte entre 1,5 e 55% da largura útil.');
 if(!FONTS.includes(input.fontFamily)||!['left','center','right'].includes(input.align))throw Error('Fonte ou alinhamento inválido.');
 const hidden=input.hidden===undefined?false:input.hidden;if(typeof hidden!=='boolean')throw Error('Visibilidade do elemento inválida.');
 const letterSpacing=number(input.letterSpacing===undefined?0:input.letterSpacing,'Espaçamento entre letras'),lineHeight=number(input.lineHeight===undefined?1:input.lineHeight,'Espaçamento entre linhas');
 if(letterSpacing<-.1||letterSpacing>.5)throw Error('Use espaçamento entre letras de -0,1 a 0,5 em.');
 if(lineHeight<.7||lineHeight>3)throw Error('Use espaçamento entre linhas de 0,7 a 3.');
 return {...item,fontFamily:input.fontFamily,align:input.align,hidden,letterSpacing,lineHeight};
}
export function constrainElement(input,change){
 const next={...input,...change};for(const key of ['x','y','w','h'])next[key]=number(next[key],'Posição ou tamanho');
 next.w=Math.max(.08,Math.min(1,next.w));next.h=Math.max(.035,Math.min(1,next.h));
 next.x=Math.max(0,Math.min(1-next.w,next.x));next.y=Math.max(0,Math.min(1-next.h,next.y));
 return validateElement(next);
}
export function templateSettings(input){
 if(!input||typeof input!=='object')throw Error('Modelo inválido.');
 if(!/^#[0-9a-f]{6}$/i.test(input.color)||!/^#[0-9a-f]{6}$/i.test(input.background))throw Error('Escolha cores válidas.');
 if(!FONTS.includes(input.font))throw Error('Fonte inválida.');
 const scale=number(input.scale,'Escala');if(scale<.8||scale>1.15)throw Error('Escala inválida.');
 const dimension=value=>{const text=String(value);if(!/^\d+(?:[,.]\d)?$/.test(text))throw Error('Use medidas em mm com até uma casa decimal.');return Number(text.replace(',','.'));};
 const widthMm=dimension(input.widthMm),heightMm=dimension(input.heightMm);
 if(widthMm<60||widthMm>420||heightMm<80||heightMm>594)throw Error('Use largura entre 60 e 420 mm e altura entre 80 e 594 mm.');
 if(heightMm<=widthMm)throw Error('O cartaz deve ficar em retrato: a altura precisa ser maior que a largura.');
 const source=input.layout===undefined?defaultLayout(input.font):input.layout;
 if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Layout inválido.');
 const layout={};for(const key of Object.keys(ELEMENTS)){if(!own(source,key))throw Error('O modelo precisa dos quatro elementos.');layout[key]=validateElement({...TEXT_DEFAULTS[key],...source[key]});}
 return {color:input.color,background:input.background,font:input.font,scale,widthMm,heightMm,layout};
}
function multilineText(value,max,label){
 if(typeof value!=='string')throw Error(`Texto de ${label} inválido.`);
 const text=value.replace(/\r\n?/g,'\n').replace(/\t/g,' ');
 if(!text.trim()||text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error(`Informe ${label} com até ${max} caracteres.`);
 return text;
}
export function normalizeTemplate(input){
 if(!input||!validId(input.id))throw Error('Identificador do modelo inválido.');
 const name=typeof input.name==='string'?input.name.trim():'';
 if(!name||name.length>60||/[\u0000-\u001f]/.test(name))throw Error('Informe um nome de até 60 caracteres.');
 const headline=multilineText(input.headline===undefined?'OFERTA':input.headline,120,'chamada');
 const productText=multilineText(input.productText===undefined?'{{produto}}':input.productText,300,'texto do produto');
 if(!productText.includes('{{produto}}'))throw Error('Mantenha {{produto}} no texto para usar o nome real de cada produto.');
 return {id:input.id,name,headline,productText,...templateSettings(input)};
}
export function defaultTemplates(){return Object.entries(SIZES).map(([id,s])=>normalizeTemplate({id,name:s.label,headline:'OFERTA',widthMm:s.widthMm,heightMm:s.heightMm,color:id==='large'?'#151515':'#c51d2b',background:id==='small'?'#fff9dd':id==='medium'?'#ffffff':'#fff159',font:'Arial',scale:1}));}
export function parseTemplates(serialized){
 if(typeof serialized!=='string'||serialized.length>300000)throw Error('Arquivo de modelos inválido.');
 const data=JSON.parse(serialized);
 if(!data||data.version!==1||!Array.isArray(data.templates)||data.templates.length>100)throw Error('Arquivo de modelos inválido.');
 const result=data.templates.map(normalizeTemplate);if(new Set(result.map(t=>t.id)).size!==result.length)throw Error('Modelos duplicados.');return result;
}
export function serializeTemplates(items){
 if(!Array.isArray(items)||items.length>100)throw Error('Lista de modelos inválida.');
 const clean=items.map(normalizeTemplate);if(new Set(clean.map(t=>t.id)).size!==clean.length)throw Error('Modelos duplicados.');
 return JSON.stringify({version:1,templates:clean});
}
export const templates=defaultTemplates();
export let storageWarning='';
function browserStorage(){try{return globalThis.localStorage??null;}catch{throw Error('O navegador bloqueou o armazenamento local. Permita o acesso para salvar seus modelos.');}}
export function loadTemplates(storage){
 try{const target=storage===undefined?browserStorage():storage;if(!target)return {loaded:false,warning:''};const saved=target.getItem(STORAGE_KEY);if(!saved)return {loaded:false,warning:''};const clean=parseTemplates(saved);templates.splice(0,templates.length,...clean);storageWarning='';return {loaded:true,warning:''};}
 catch{storageWarning='Os modelos salvos não puderam ser lidos. Os modelos disponíveis continuam seguros; ao salvar, uma nova cópia local será gravada.';return {loaded:false,warning:storageWarning};}
}
function commitTemplates(next,storage){
 const serialized=serializeTemplates(next),target=storage===undefined?browserStorage():storage;
 // Node-only callers can exercise the model without a browser. A browser never
 // reports a persistent save when its storage is unavailable or full.
 if(!target&&typeof window!=='undefined')throw Error('Armazenamento local indisponível. Permita o armazenamento para salvar.');
 if(target){try{target.setItem(STORAGE_KEY,serialized);}catch{throw Error('Não foi possível salvar neste navegador. Verifique o espaço e a permissão de armazenamento.');}}
 templates.splice(0,templates.length,...parseTemplates(serialized));storageWarning='';
}
export function saveTemplate(id,input,storage){
 const index=templates.findIndex(t=>t.id===id);if(index<0)throw Error('Modelo inválido.');
 const saved=normalizeTemplate({...templates[index],...input,id});const next=templates.map((t,i)=>i===index?saved:t);commitTemplates(next,storage);return clone(saved);
}
export function deleteTemplate(id,storage){
 const existing=templates.find(t=>t.id===id);if(!existing)throw Error('Modelo inválido.');
 commitTemplates(templates.filter(t=>t.id!==id),storage);return clone(existing);
}
export function createTemplate(input,storage){
 if(templates.length>=100)throw Error('Limite de 100 modelos neste navegador.');
 const id=`poster-${globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`}`;
 const saved=normalizeTemplate({...defaultTemplates()[1],...input,id});commitTemplates([...templates,saved],storage);return clone(saved);
}
export const dimensionLabel=t=>`${String(t.widthMm).replace('.',',')} × ${String(t.heightMm).replace('.',',')} mm · retrato`;
export function offerTemplate(offer){const t=offer.templateSnapshot||templates.find(t=>t.id===offer.templateId);if(!t)throw Error('Modelo inválido.');return normalizeTemplate(t);}
export function priceCents(value){const text=String(value).trim();if(!/^\d{1,4}(?:[,.]\d{1,2})?$/.test(text))throw Error('Informe um preço entre R$ 0,01 e R$ 9.999,99, com até duas casas decimais.');const [whole,fraction='']=text.split(/[,.]/);const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(cents<1)throw Error('O preço precisa ser maior que zero.');return cents;}
export function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T12:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
export function validateOffer(input,products){
 const product=products.find(p=>p.id===input.productId);if(!product)throw Error('Selecione um produto do catálogo.');
 if(!['kg','unid'].includes(input.unit))throw Error('Selecione kg ou unid.');
 if(!validDate(input.start)||!validDate(input.end)||input.end<input.start)throw Error('Informe datas válidas. O término deve ser igual ou posterior ao início.');
 const template=templates.find(t=>t.id===input.templateId);if(!template)throw Error('Selecione um modelo.');
 return {productId:product.id,name:product.name,cents:priceCents(input.price),unit:input.unit,start:input.start,end:input.end,templateId:template.id,templateSnapshot:normalizeTemplate(template)};
}
export function paginate(offers,size){if(!templates.some(t=>t.id===size))throw Error('Tamanho inválido.');return offers.map(offer=>[offer]);}
const dateLabel=value=>value.split('-').reverse().join('/');
const percent=value=>Number((value*100).toFixed(4));
export function elementStyle(element){const e=validateElement(element);return `left:${percent(e.x)}%;top:${percent(e.y)}%;width:${percent(e.w)}%;height:${percent(e.h)}%;--element-size:${e.fontSize};--element-font:${e.fontFamily};--element-letter-spacing:${e.letterSpacing};--element-line-height:${e.lineHeight};--element-justify:${{left:'flex-start',center:'center',right:'flex-end'}[e.align]};text-align:${e.align}`;}
export function resolveProductText(offer,template){
 const name=typeof offer.displayName==='string'&&offer.displayName.trim()?offer.displayName:offer.name;
 if(typeof name!=='string')throw Error('Nome do produto inválido.');
 return (template.productText??'{{produto}}').replaceAll('{{produto}}',name);
}
export function posterMarkup(offer,template){
 const t=template?normalizeTemplate(template):offerTemplate(offer);
 if(!Number.isInteger(offer.cents)||offer.cents<1||offer.cents>999999||typeof offer.name!=='string'||!['kg','unid'].includes(offer.unit)||!validDate(offer.start)||!validDate(offer.end))throw Error('Cartaz inválido.');
 const productText=resolveProductText(offer,t),amount=(offer.cents/100).toFixed(2).split('.'),nameScale=productText.length>65?.60:productText.length>35?.78:1;
 const attrs=key=>`data-poster-element="${key}" style="${esc(elementStyle(t.layout[key]))}"`;
 const visible=(key,markup)=>t.layout[key].hidden?'':markup;
 return `<article class="price-poster poster-${esc(t.id)}" style="--poster-ink:${esc(t.color)};--poster-paper:${esc(t.background)};--poster-font:${esc(t.font)};--poster-scale:${t.scale};--name-scale:${nameScale};--amount-scale:${offer.cents>=100000?.70:offer.cents>=10000?.85:1}">${visible('headline',`<div class="poster-element poster-kicker" ${attrs('headline')}>${esc(t.headline)}</div>`)}${visible('product',`<h2 class="poster-element poster-product" ${attrs('product')}>${esc(productText)}</h2>`)}${visible('price',`<div class="poster-element poster-price-area" ${attrs('price')}><div class="poster-price" role="img" aria-label="${esc(`R$ ${amount.join(',')} por ${offer.unit}`)}"><span class="poster-currency" aria-hidden="true">R$</span><strong class="poster-integer" aria-hidden="true">${amount[0]}</strong><div class="poster-price-side" aria-hidden="true"><span class="poster-cents">,${amount[1]}</span><span class="poster-unit">${offer.unit==='kg'?'KG':'UN'}</span></div></div></div>`)}${visible('validity',`<p class="poster-element poster-validity" ${attrs('validity')}>Válido de ${esc(dateLabel(offer.start))} até ${esc(dateLabel(offer.end))}</p>`)}</article>`;
}
export const paperStyle=t=>`--paper-ratio:${t.widthMm}/${t.heightMm};--inset-x:${(500/t.widthMm).toFixed(5)}%;--inset-y:${(500/t.heightMm).toFixed(5)}%`;
export function miniMarkup(template){const t=normalizeTemplate(template);return `<div class="poster-mini-paper" style="${paperStyle(t)};--mini-width:${(226*t.widthMm/t.heightMm).toFixed(2)}px"><div class="poster-mini-content">${posterMarkup(sampleOffer(t.id),t)}</div></div>`;}
export function sheetsMarkup(offers){
 const rules=[],pages=offers.map((offer,i)=>{const t=offerTemplate(offer),page=`poster-page-${i}`;rules.push(`@page ${page}{size:${t.widthMm}mm ${t.heightMm}mm;margin:0;}`);return `<section class="poster-sheet sheet-${esc(t.id)}" style="page:${page};--paper-width:${t.widthMm}mm;--paper-height:${t.heightMm}mm;--poster-unit:${((t.widthMm-10)/100).toFixed(4)}mm" aria-label="${esc(`${t.name} · ${dimensionLabel(t)} · um cartaz por folha`)}">${posterMarkup(offer,t)}</section>`;});
 return `<style class="poster-page-rules">@media print{${rules.join('')}}</style>${pages.join('')}`;
}
export const sampleOffer=id=>({name:'Arroz branco 1 kg',cents:499,unit:'unid',start:'2026-10-20',end:'2026-10-27',templateId:id});
loadTemplates();
