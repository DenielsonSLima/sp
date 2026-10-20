import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {templates,defaultTemplates,defaultLayout,normalizeTemplate,validateElement,constrainElement,createTemplate,saveTemplate,deleteTemplate,resolveProductText,validateOffer,offerTemplate,parseTemplates,serializeTemplates,loadTemplates,STORAGE_KEY,posterMarkup,miniMarkup,sheetsMarkup,sampleOffer,paperStyle} from '../interno/cadastros/modelos-cartaz/model.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const input=id=>({productId:'rice',price:'14,99',unit:'kg',start:'2026-10-20',end:'2026-10-27',templateId:id});
const products=[{id:'rice',name:'Arroz branco'}];
function reset(){templates.splice(0,templates.length,...defaultTemplates());}

test('default layout has exactly four independent, bounded editable groups',()=>{
 const a=defaultLayout(),b=defaultLayout();assert.deepEqual(Object.keys(a),['headline','product','price','validity']);
 for(const element of Object.values(a)){assert.deepEqual(validateElement(element),element);assert.ok(element.x+element.w<=1);assert.ok(element.y+element.h<=1);}
 a.price.fontFamily='Georgia';a.product.x=.1;assert.equal(b.price.fontFamily,'Arial');assert.equal(b.product.x,.04);
});
test('invalid group geometry, fonts, alignment and incomplete layouts are rejected',()=>{
 const original=defaultLayout().price;
 for(const change of [{x:-.1},{y:-.1},{x:.8},{y:.9},{w:0},{h:.02},{w:1.1},{h:2},{x:Infinity},{y:NaN},{w:''},{fontSize:0},{fontSize:56},{fontSize:NaN},{fontFamily:'url(evil)'},{align:'justify'}])assert.throws(()=>validateElement({...original,...change}));
 for(const layout of [null,[],{}, {price:original}])assert.throws(()=>normalizeTemplate({...defaultTemplates()[0],layout}));
 const e=validateElement({...original,onclick:'bad',extra:'ignored'});assert.equal(e.onclick,undefined);assert.equal(e.extra,undefined);
});
test('drag and resize constraints keep boxes on the useful paper area',()=>{
 const original=defaultLayout().product;
 for(const change of [{x:-5,y:-5},{x:5,y:5},{w:99,h:99},{w:-1,h:-1},{x:.123456,y:.345678,w:.25,h:.20}]){
  const e=constrainElement(original,change);assert.ok(e.x>=0&&e.y>=0);assert.ok(e.w>=.08&&e.h>=.035);assert.ok(e.x+e.w<=1.000001&&e.y+e.h<=1.000001);
 }
 assert.equal(original.x,.04);assert.throws(()=>constrainElement(original,{w:NaN}));
});
test('create and update arbitrary models persist and are immediately accepted by Promoções',()=>{
 reset();const db=storage();
 try{
  const created=createTemplate({...defaultTemplates()[1],name:'Hortifruti de terça',widthMm:120,heightMm:180},db);
  assert.match(created.id,/^poster-/);assert.equal(templates.length,4);assert.equal(parseTemplates(db.getItem(STORAGE_KEY))[3].name,'Hortifruti de terça');
  const offer=validateOffer(input(created.id),products);assert.equal(offer.templateId,created.id);assert.deepEqual(offer.templateSnapshot.layout,created.layout);
  const layout=clone(created.layout);layout.price.fontFamily='Georgia';layout.price.fontSize=25;layout.product.x=.08;layout.product.w=.84;
  const saved=saveTemplate(created.id,{name:'Hortifruti especial',layout},db);assert.equal(saved.layout.price.fontFamily,'Georgia');assert.equal(parseTemplates(db.getItem(STORAGE_KEY))[3].layout.price.fontSize,25);
  assert.match(sheetsMarkup([validateOffer(input(created.id),products)]),/size:120mm 180mm/);
  assert.deepEqual(offerTemplate(offer).layout,created.layout);assert.equal(offerTemplate(offer).name,'Hortifruti de terça');
  saved.layout.price.fontSize=40;assert.equal(templates[3].layout.price.fontSize,25);
 }finally{reset();}
});
test('snapshots are deep and render independently even after a model leaves the active list',()=>{
 reset();const offer=validateOffer(input('small'),products);const expected=clone(offer.templateSnapshot);
 templates[0].layout.price.x=.1;templates[0].layout.price.w=.8;templates[0].layout.price.fontFamily='Impact';
 assert.deepEqual(offer.templateSnapshot,expected);const read=offerTemplate(offer);read.layout.price.fontSize=50;assert.deepEqual(offer.templateSnapshot,expected);
 templates.splice(0,1);assert.match(sheetsMarkup([offer]),/size:105mm 148mm/);assert.match(posterMarkup(offer),/--element-font:Arial/);reset();
});
test('valid storage round-trips custom styles and strips unknown properties',()=>{
 const a=defaultTemplates();a[0].id='my-custom-model';a[0].layout.headline.fontFamily='Impact';a[0].layout.product.align='right';a[0].layout.validity.fontSize=3.2;a[0].unknown='strip';
 const result=parseTemplates(serializeTemplates(a));assert.equal(result[0].id,'my-custom-model');assert.equal(result[0].layout.headline.fontFamily,'Impact');assert.equal(result[0].layout.product.align,'right');assert.equal(result[0].unknown,undefined);
 const db=storage();db.setItem(STORAGE_KEY,serializeTemplates(a));assert.equal(loadTemplates(db).loaded,true);assert.equal(templates[0].layout.validity.fontSize,3.2);reset();
});
test('malformed persisted state never replaces available models',()=>{
 reset();const previous=serializeTemplates(templates),valid=defaultTemplates();
 const values=['{','null','[]',JSON.stringify({version:99,templates:valid}),JSON.stringify({version:1,templates:[valid[0],valid[0]]}),JSON.stringify({version:1,templates:[{...valid[0],id:'__proto__'}]}),JSON.stringify({version:1,templates:[{...valid[0],widthMm:9999}]}),JSON.stringify({version:1,templates:[{...valid[0],layout:{}}]}),JSON.stringify({version:1,templates:[{...valid[0],color:'red;display:none'}]}),'x'.repeat(300001)];
 for(const value of values){assert.throws(()=>parseTemplates(value));const db=storage();db.setItem(STORAGE_KEY,value);const result=loadTemplates(db);assert.equal(result.loaded,false);assert.ok(result.warning);assert.equal(serializeTemplates(templates),previous);}
 assert.deepEqual(parseTemplates(serializeTemplates([])),[]);assert.throws(()=>serializeTemplates([valid[0],valid[0]]));
});
test('failed storage writes preserve both existing templates and the editor draft',()=>{
 reset();const before=serializeTemplates(templates),draft=clone(templates[0]);draft.name='Alteração pendente';draft.layout.price.fontFamily='Georgia';
 const failing={getItem:()=>null,setItem:()=>{throw Error('QuotaExceededError');}};
 assert.throws(()=>saveTemplate('small',draft,failing),/Não foi possível salvar/);assert.equal(serializeTemplates(templates),before);assert.equal(draft.name,'Alteração pendente');
 assert.throws(()=>createTemplate(draft,failing),/Não foi possível salvar/);assert.equal(serializeTemplates(templates),before);
 const result=loadTemplates({getItem:()=>{throw Error('SecurityError');}});assert.equal(result.loaded,false);assert.ok(result.warning);reset();
});
test('canvas and miniature insets represent exactly the same 5mm margin on each sheet',()=>{
 for(const template of defaultTemplates()){
  const style=paperStyle(template),x=Number(style.match(/--inset-x:([\d.]+)/)[1]),y=Number(style.match(/--inset-y:([\d.]+)/)[1]);
  assert.ok(Math.abs(x*template.widthMm/100-5)<.0001);assert.ok(Math.abs(y*template.heightMm/100-5)<.0001);
 }
});
test('cards, editor samples and physical pages use identical positioned groups and price structure',()=>{
 const template=defaultTemplates()[0];template.id='custom-poster';template.headline='<img src=x onerror=alert(1)>';template.layout.price={...template.layout.price,x:.1,y:.5,w:.8,h:.3,fontSize:25,fontFamily:'Impact',align:'right'};
 const offer={...sampleOffer(template.id),unit:'kg',templateSnapshot:template};const shared=posterMarkup(offer,template);
 assert.equal((shared.match(/data-poster-element=/g)||[]).length,4);assert.match(shared,/left:10%;top:50%;width:80%;height:30%;--element-size:25;--element-font:Impact/);assert.match(shared,/poster-unit[^>]*>KG/);assert.ok(!shared.includes('<img'));assert.match(shared,/&lt;img/);
 assert.ok(sheetsMarkup([offer]).includes(shared));assert.ok(miniMarkup(template).includes(posterMarkup(sampleOffer(template.id),template)));assert.match(sheetsMarkup([offer]),/--poster-unit:0.9500mm/);
});
test('visual editor contract includes accessible drag, keyboard and numeric controls with guarded dismissal',async()=>{
 const source=await readFile(new URL('../interno/cadastros/modelos-cartaz/editor.js',import.meta.url),'utf8');
 for(const token of ['setPointerCapture','releasePointerCapture',"'pointercancel'","'lostpointercapture'",'ArrowLeft','event.shiftKey','trapFocus','event.key!==\'Tab\'','showModal()','requestClose','data-keep','data-discard','event.preventDefault()','aria-labelledby','aria-pressed',"field('x'","field('h'","field('fontSize'",'createTemplate(draft)','saveTemplate(draft.id,draft)','posterMarkup(sampleOffer(draft.id),draft)'])assert.ok(source.includes(token),token);
 const gallery=await readFile(new URL('../interno/cadastros/modelos-cartaz/index.js',import.meta.url),'utf8');assert.match(gallery,/Criar novo/);assert.match(gallery,/data-template-id/);assert.ok(!gallery.includes('<form'));
 const css=await readFile(new URL('../interno/cadastros/modelos-cartaz/styles.css',import.meta.url),'utf8');assert.match(css,/touch-action:none/);assert.match(css,/min-width:44px;min-height:44px/);assert.match(css,/grid-template-rows:auto minmax\(0,1fr\) auto/);assert.match(css,/overflow:auto;overscroll-behavior:contain/);assert.match(css,/@media\(max-width:760px\)/);
});

test('drag percentages and persisted fractional font sizes do not trigger native stepMismatch',async()=>{
 const source=await readFile(new URL('../interno/cadastros/modelos-cartaz/editor.js',import.meta.url),'utf8');
 assert.match(source,/const field=\(name,label,min,max,step='any'\)/);
 const template=defaultTemplates()[0];template.layout.product={...template.layout.product,x:.1234,w:.7654,fontSize:8.55};
 const clean=normalizeTemplate(template);assert.equal(clean.layout.product.x*100,12.34);assert.equal(clean.layout.product.fontSize,8.55);
 for(const name of ['x','y','w','h','fontSize'])assert.ok(source.includes(`field('${name}'`));
});

test('legacy snapshots migrate independent spacing and visibility defaults without losing layout',()=>{
 const legacy=defaultTemplates()[0];delete legacy.productText;
 for(const element of Object.values(legacy.layout)){delete element.hidden;delete element.letterSpacing;delete element.lineHeight;}
 const clean=normalizeTemplate(legacy);assert.equal(clean.productText,'{{produto}}');assert.equal(clean.layout.headline.letterSpacing,.1);assert.equal(clean.layout.headline.lineHeight,1.1);assert.equal(clean.layout.product.lineHeight,1.08);assert.equal(clean.layout.price.lineHeight,1);assert.equal(clean.layout.validity.lineHeight,1.4);
 for(const element of Object.values(clean.layout))assert.equal(element.hidden,false);
 assert.equal(clean.layout.product.x,.04);
});
test('independent letter spacing and line height are bounded and persist per group',()=>{
 reset();const db=storage(),draft=defaultTemplates()[0];
 draft.layout.product.letterSpacing=.12;draft.layout.product.lineHeight=1.65;draft.layout.price.letterSpacing=-.04;draft.layout.price.lineHeight=1.2;
 const saved=saveTemplate('small',draft,db),loaded=parseTemplates(db.getItem(STORAGE_KEY))[0];assert.deepEqual(loaded.layout,saved.layout);assert.equal(saved.layout.headline.letterSpacing,.1);assert.equal(saved.layout.validity.lineHeight,1.4);
 for(const change of [{letterSpacing:-.11},{letterSpacing:.51},{letterSpacing:Infinity},{letterSpacing:''},{lineHeight:.69},{lineHeight:3.01},{lineHeight:NaN},{hidden:'true'}])assert.throws(()=>validateElement({...draft.layout.product,...change}));
 const markup=posterMarkup(sampleOffer('small'),saved);assert.match(markup,/--element-letter-spacing:0.12;--element-line-height:1.65/);reset();
});
test('removing and restoring a group preserves all its properties and previous campaign snapshots',()=>{
 reset();const db=storage(),offer=validateOffer(input('small'),products),draft=clone(templates[0]),geometry=clone(draft.layout.product);
 draft.layout.product.hidden=true;const removed=saveTemplate('small',draft,db);assert.ok(!posterMarkup(sampleOffer('small'),removed).includes('data-poster-element="product"'));assert.ok(posterMarkup(offer).includes('data-poster-element="product"'));assert.equal(parseTemplates(db.getItem(STORAGE_KEY))[0].layout.product.hidden,true);
 removed.layout.product.hidden=false;const restored=saveTemplate('small',removed,db);assert.deepEqual(restored.layout.product,geometry);assert.ok(posterMarkup(sampleOffer('small'),restored).includes('data-poster-element="product"'));reset();
});
test('deleting models is atomic and deleting the last one persists a valid empty gallery',()=>{
 reset();const db=storage(),offer=validateOffer(input('small'),products),before=serializeTemplates(templates);
 assert.throws(()=>deleteTemplate('small',{setItem:()=>{throw Error('blocked');}}));assert.equal(serializeTemplates(templates),before);
 assert.throws(()=>deleteTemplate('unknown',db));
 for(const template of [...templates])deleteTemplate(template.id,db);
 assert.equal(templates.length,0);assert.deepEqual(parseTemplates(db.getItem(STORAGE_KEY)),[]);assert.match(sheetsMarkup([offer]),/size:105mm 148mm/);
 reset();assert.equal(loadTemplates(db).loaded,true);assert.equal(templates.length,0);
 const created=createTemplate({name:'Primeiro novo modelo'},db);assert.equal(templates.length,1);assert.equal(templates[0].id,created.id);reset();
});
test('multiline template content preserves the live product variable and optional campaign display name',()=>{
 const template=normalizeTemplate({...defaultTemplates()[0],headline:'OFERTA\nESPECIAL',productText:'SELEÇÃO\n{{produto}}\nDA SEMANA'});
 const offer={...sampleOffer(template.id),name:'Arroz branco 1 kg',displayName:'Arroz branco\n1 kg'};
 assert.equal(resolveProductText(offer,template),'SELEÇÃO\nArroz branco\n1 kg\nDA SEMANA');assert.equal(offer.name,'Arroz branco 1 kg');
 const other={...offer,name:'Feijão carioca 1 kg',displayName:''};assert.match(resolveProductText(other,template),/Feijão carioca 1 kg/);assert.ok(!resolveProductText(other,template).includes('Arroz'));
 assert.throws(()=>normalizeTemplate({...template,productText:'Arroz fixo'}));assert.throws(()=>normalizeTemplate({...template,productText:'x'.repeat(301)+'{{produto}}'}));
 const html=posterMarkup({...offer,displayName:'<script>\nproduto'},template);assert.match(html,/OFERTA\nESPECIAL/);assert.match(html,/&lt;script&gt;\nproduto/);assert.ok(!html.includes('<script>'));assert.equal(normalizeTemplate({...template,headline:'A\r\nB'}).headline,'A\nB');
});
test('editor offers reversible group removal, multiline fields, delete confirmation and empty-state recovery',async()=>{
 const editor=await readFile(new URL('../interno/cadastros/modelos-cartaz/editor.js',import.meta.url),'utf8'),gallery=await readFile(new URL('../interno/cadastros/modelos-cartaz/index.js',import.meta.url),'utf8'),css=await readFile(new URL('../interno/cadastros/modelos-cartaz/styles.css',import.meta.url),'utf8');
 for(const token of ['data-toggle-element','Restaurar elemento','Remover elemento',"['Delete','Backspace']",'confirmTemplateDeletion','data-delete-cancel','data-delete-confirm','textarea name="headline"','textarea name="productText"',"field('letterSpacing'","field('lineHeight'",'textarea:not(:disabled)','onDeleted?.(removed)','if(!parentDialog||parentDialog.isConnected)document.body.style.overflow=previousOverflow'])assert.ok(editor.includes(token),token);
 for(const token of ['onDeleted:deleted','data-delete-template','Nenhum modelo cadastrado','data-empty-create'])assert.ok(gallery.includes(token),token);
 assert.match(css,/white-space:pre-wrap/);assert.match(css,/letter-spacing:calc\(var\(--element-letter-spacing\)\*1em\)/);assert.match(css,/line-height:var\(--element-line-height\)/);assert.match(css,/poster-editor-actions\{display:flex;flex-wrap:wrap/);assert.match(css,/poster-editor-properties textarea\{/);assert.match(css,/poster-object\[hidden\]\{display:none/);
});
