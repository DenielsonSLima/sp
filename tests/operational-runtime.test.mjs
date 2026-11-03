import test from 'node:test';
import assert from 'node:assert/strict';
import {quotes,createQuote,totals as quoteTotals} from '../interno/cotacao/state.js';
import {hortifrutiRepository,loadHortifruti} from '../interno/hortifruti/state.js';
import {summary} from '../interno/hortifruti/model.js';
import {returnRepository,totals as returnTotals} from '../interno/devolucoes-fornecedores/state.js';
import {campaignStore} from '../interno/promocoes/state.js';
import {priceTableStore} from '../interno/tabela-precos/state.js';
import {calendarStore} from '../interno/calendario/state.js';
import {templates,loadFlyerTemplates,applyTemplateDefinition} from '../interno/encartes/templates.js';
import {layerAssets} from '../interno/encartes/layer-assets.js';
import {createDesign,createProductElement,validateDesign} from '../interno/encartes/model.js';
import {saveDesign} from '../interno/encartes/storage.js';

test('runtime starts without seeded operational records and never selects a local backend in Node',async()=>{
 assert.deepEqual(quotes,[]);assert.deepEqual(campaignStore.list(),[]);assert.deepEqual(hortifrutiRepository.list(),[]);
 assert.deepEqual(templates,[]);assert.deepEqual(layerAssets,[]);
 const operations=[()=>createQuote({}),()=>hortifrutiRepository.create({}),()=>returnRepository.create({}),()=>campaignStore.create({}),()=>priceTableStore.saveDraft(null,{}),()=>calendarStore.create({title:'Registro'}),()=>saveDesign(createDesign()),()=>loadHortifruti(),()=>loadFlyerTemplates()];
 for(const operation of operations)await assert.rejects(operation,/conta autorizada|empresa/);
 assert.deepEqual(quotes,[]);assert.deepEqual(campaignStore.list(),[]);assert.deepEqual(priceTableStore.list(),[]);
});

test('official computed selectors require the server result instead of calculating a replacement',()=>{
 const quote={computed:{totals:[{id:'supplier',total:725}]}};
 assert.deepEqual(quoteTotals(quote),quote.computed.totals);
 assert.deepEqual(summary({computed:{summary:{total:725,incomplete:0}}}),{total:725,incomplete:0});
 assert.equal(returnTotals({computed:{totals:{total:725,pending:25}}}).pending,25);
 assert.throws(()=>quoteTotals({providers:[],items:[]}),/banco/);
 assert.throws(()=>summary({items:[]}),/banco/);
 assert.throws(()=>returnTotals({items:[],settlements:[]}),/banco/);
});

test('flyer layout comes from a supplied database definition and scales linked layers without mutating it',()=>{
 const source=createDesign({width:1080,height:1350}),slot={...createProductElement({name:'Produto'},source),placeholder:true,x:100,y:200,width:400,height:500,templatePart:true};
 source.bgColor='#123456';source.elements=[slot,{id:'linked-title',type:'text',text:'Produto',fontSize:40,x:100,y:710,width:400,height:80,linkedProductId:slot.id,linkedField:'name',templatePart:true}];
 const record={id:'remote-layout',name:'Modelo cadastrado',definition:validateDesign(source)},before=structuredClone(record);
 const input=createDesign({width:540,height:675});input.elements=[createProductElement({name:'Tomate',unit:'KG'},input)];
 const result=applyTemplateDefinition(input,record),product=result.elements.find(element=>element.type==='product'),label=result.elements.find(element=>element.linkedField==='name');
 assert.equal(result.bgColor,'#123456');assert.equal(product.name,'Tomate');assert.equal(product.x,50);assert.equal(product.y,100);assert.equal(product.width,200);assert.equal(label.fontSize,20);assert.equal(label.linkedProductId,product.id);assert.equal(label.text,'Tomate');assert.deepEqual(record,before);
 assert.throws(()=>applyTemplateDefinition(input,{id:'missing'}),/definição/);
});

test('all migrated flyer definitions support the geometric engine at the gallery artboard sizes',async()=>{
 const {readFile}=await import('node:fs/promises');
 const migration=JSON.parse(await readFile(new URL('../supabase/seeds/original-catalog-v1.json',import.meta.url),'utf8'));
 assert.equal(migration.flyerTemplates.length,8);
 for(const record of migration.flyerTemplates){
  for(const [width,height] of [[1080,1350],[1080,1080],[1080,1920]]){
   const result=applyTemplateDefinition(createDesign({width,height}),record),ids=new Set(result.elements.map(element=>element.id));
   assert.equal(result.elements.filter(element=>element.type==='product').length,record.productCount);
   assert.equal(ids.size,result.elements.length);
   assert(result.elements.every(element=>!element.linkedProductId||ids.has(element.linkedProductId)));
   assert.equal(result.width,width);assert.equal(result.height,height);
  }
 }
});
