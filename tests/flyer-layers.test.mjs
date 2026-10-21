import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createDesign,validateDesign} from '../interno/encartes/model.js';
import {applyTemplate} from '../interno/encartes/templates.js';
import {fillTemplateProducts,syncProductTexts,updateLinkedProductText} from '../interno/encartes/layered-templates.js';
import {transformedGeometry} from '../interno/encartes/interaction.js';
import {exportDesignJson,parseDesignJson} from '../interno/encartes/storage.js';
import {renderDesign} from '../interno/encartes/renderer.js';
import {createLayerPngBlob,embedDesignAssets} from '../interno/encartes/export.js';
const require=createRequire(import.meta.url);let native;try{native=require('@napi-rs/canvas');}catch{}
const raster='data:image/png;base64,aGVsbG8=';

test('rotation, mirroring, transparency and layer names survive persistence and backups',()=>{
 const d=createDesign();d.elements=[{id:'sticker',type:'image',src:'./assets/encartes/camadas/raio-dourado.png',x:100,y:100,width:200,height:300,rotation:35,flipX:true,flipY:true,opacity:.45,hidden:true,label:'Meu selo'}];
 const restored=parseDesignJson(exportDesignJson(d)).elements[0];
 for(const key of ['rotation','flipX','flipY','opacity','hidden','label'])assert.equal(restored[key],d.elements[0][key]);
 for(const src of ['./assets/encartes/camadas/../../secret.png','./assets/arbitrary.png','https://example.test/logo.png'])assert.throws(()=>validateDesign({...d,elements:[{...d.elements[0],src}]}));
});
test('transform handles use the object center and preserve flips with bounded dimensions',()=>{
 const e={x:10,y:10,width:300,height:200};
 assert.deepEqual(transformedGeometry(e,{centerX:300,centerY:300,scaleX:2,scaleY:-.5,rotation:450},{width:1080,height:1350}),{x:0,y:250,width:600,height:100,rotation:90,flipX:false,flipY:true});
 const tiny=transformedGeometry(e,{centerX:-10,centerY:5000,scaleX:.001,scaleY:10,rotation:-450},{width:1080,height:1350});
 assert.equal(tiny.width,1);assert.equal(tiny.height,1350);assert.equal(tiny.x,0);assert.equal(tiny.y,0);assert.equal(tiny.rotation,-90);
 assert.throws(()=>transformedGeometry(e,{centerX:NaN,centerY:0,scaleX:1,scaleY:1,rotation:0},{width:1080,height:1350}));
});
test('layered templates keep photos, names, prices, stickers and backgrounds independent',()=>{
 const design=fillTemplateProducts(applyTemplate(createDesign(),'sabor-mercearia'),[{id:'catalog',name:'Biscoito Vitarella',category:'Mercearia',unit:'UN',photo:raster}],{category:'Mercearia'});
 const photo=design.elements.find(e=>e.type==='product');assert.equal(photo.layout,'photo');assert.equal(photo.image,raster);assert.equal(photo.priceCents,undefined);assert.equal(photo.priceText,'');
 const name=design.elements.find(e=>e.linkedProductId===photo.id&&e.linkedField==='name'),price=design.elements.find(e=>e.linkedProductId===photo.id&&e.linkedField==='price');
 assert.equal(name.text,'Biscoito Vitarella');assert.equal(price.text,'R$ —,—');assert.notEqual(photo.id,name.id);assert.notEqual(name.id,price.id);
 price.x+=100;photo.name='Outro produto';photo.priceText='R$ 12,90';syncProductTexts(design,photo);assert.equal(name.text,'Outro produto');assert.equal(price.text,'R$ 12,90');assert.ok(price.x>100);name.text='Nome personalizado';price.text='R$ 15,49';updateLinkedProductText(design,name);updateLinkedProductText(design,price);syncProductTexts(design,photo);assert.equal(photo.name,'Nome personalizado');assert.equal(photo.priceCents,1549);assert.equal(name.text,'Nome personalizado');assert.equal(price.text,'R$ 15,49');
 assert.equal(design.elements.find(e=>e.label==='Fundo do modelo').locked,true);
 assert.ok(design.elements.some(e=>e.src?.includes('balao-coracao.png')));
 const switched=applyTemplate(design,'oferta-relampago');assert.equal(switched.elements.filter(e=>e.label==='Fundo do modelo').length,1);assert.equal(switched.elements.some(e=>e.src?.includes('balao-coracao.png')),false);assert.equal(switched.elements.find(e=>e.type==='product').priceText,'R$ 15,49');
});
test('PNG render and isolated layer export respect rotation, mirroring, visibility and alpha',{skip:!native},async()=>{
 const oldDocument=globalThis.document,oldImage=globalThis.Image;globalThis.Image=native.Image;
 globalThis.document={createElement:()=>{const canvas=native.createCanvas(1,1);canvas.toBlob=callback=>callback(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));return canvas;}};
 try{
  const photo=native.createCanvas(20,10),ctx=photo.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,10,10);ctx.fillStyle='#0000ff';ctx.fillRect(10,0,10,10);
  const d={width:600,height:800,bgColor:'#ffffff',elements:[{id:'shape',type:'shape',x:100,y:100,width:100,height:50,rotation:90,fill:'#ff0000'},{id:'img',type:'image',src:photo.toDataURL('image/png'),x:10,y:10,width:20,height:10,flipX:true},{id:'hidden',type:'shape',x:0,y:300,width:50,height:50,fill:'#000000',hidden:true},{id:'faded',type:'shape',x:200,y:200,width:40,height:40,fill:'#000000',opacity:.5}]};
  const canvas=native.createCanvas(1,1);await renderDesign(canvas,d);
  const pixel=(x,y)=>Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data);
  assert.deepEqual(pixel(150,80),[255,0,0,255]);assert.deepEqual(pixel(110,110),[255,255,255,255]);assert.deepEqual(pixel(12,12),[0,0,255,255]);assert.deepEqual(pixel(10,310),[255,255,255,255]);assert.ok(pixel(210,210)[0]>=127&&pixel(210,210)[0]<=128);
  const blob=await createLayerPngBlob({id:'ellipse',type:'shape',x:300,y:300,width:100,height:60,shapeKind:'ellipse',fill:'#ff0000'});
  const layer=await native.loadImage(Buffer.from(await blob.arrayBuffer())),proof=native.createCanvas(100,60);proof.getContext('2d').drawImage(layer,0,0);assert.equal(proof.getContext('2d').getImageData(0,0,1,1).data[3],0);assert.equal(proof.getContext('2d').getImageData(50,30,1,1).data[3],255);
 }finally{globalThis.document=oldDocument;globalThis.Image=oldImage;}
});
test('portable backup embeds bundled PNGs once and never mutates the original design',async()=>{
 const oldFetch=globalThis.fetch,oldReader=globalThis.FileReader;let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,blob:async()=>new Blob(['hello'],{type:'image/png'})};};
 globalThis.FileReader=class{readAsDataURL(){this.result=raster;queueMicrotask(()=>this.onload());}};
 try{
  const d=createDesign(),image={id:'one',type:'image',src:'./assets/encartes/camadas/raio-dourado.png',x:0,y:0,width:100,height:100};d.elements=[image,{...image,id:'two'}];
  const embedded=await embedDesignAssets(d);assert.equal(calls,1);assert.equal(embedded.elements[0].src,raster);assert.equal(d.elements[0].src,image.src);assert.equal(parseDesignJson(exportDesignJson(embedded)).elements[1].src,raster);
 }finally{globalThis.fetch=oldFetch;globalThis.FileReader=oldReader;}
});
test('all built-in decorative assets are local separate PNGs and Konva ships with its license',async()=>{
 const {layerAssets}=await import('../interno/encartes/layer-assets.js');
 for(const asset of layerAssets){const bytes=await readFile(new URL('../'+asset.src.replace(/^\.\//,''),import.meta.url));assert.equal(bytes.subarray(1,4).toString(),'PNG');}
 const license=await readFile(new URL('../assets/vendor/konva/LICENSE',import.meta.url),'utf8');assert.match(license,/MIT|Permission is hereby granted/);
});
