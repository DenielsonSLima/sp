import test from 'node:test';
import assert from 'node:assert/strict';
import {configureDesign} from '../interno/encartes/document-settings.js';
import {createDesign,createTextElement,validateDesign} from '../interno/encartes/model.js';

test('document resizing keeps independent layers, their text and locked state without changing the current draft',()=>{
 const design=createDesign({width:1080,height:1080});
 design.elements=[{...createTextElement(design),x:100,y:200,width:500,height:100,fontSize:50,text:'Oferta da semana',locked:true}];
 const before=structuredClone(design),next=configureDesign(design,{width:540,height:1080,bgColor:'#123456'});
 assert.deepEqual(design,before);assert.equal(next.width,540);assert.equal(next.height,1080);assert.equal(next.bgColor,'#123456');
 const layer=next.elements[0];assert.equal(layer.id,design.elements[0].id);assert.equal(layer.text,'Oferta da semana');assert.equal(layer.locked,true);assert.equal(layer.x,50);assert.equal(layer.y,200);assert.equal(layer.width,250);assert.equal(layer.height,100);assert.equal(layer.fontSize,25);
});

test('changing only the document background preserves every layer value',()=>{
 const design=createDesign();design.elements=[createTextElement(design)];
 const next=configureDesign(design,{width:design.width,height:design.height,bgColor:'#abcdef'});
 assert.deepEqual(next.elements,validateDesign(design).elements);assert.equal(next.bgColor,'#abcdef');
});

test('invalid document dimensions are rejected without mutating the draft',()=>{
 const design=createDesign(),before=structuredClone(design);
 for(const [width,height] of [[0,1080],[1080,4097],[320.5,1080],[4096,4096]])assert.throws(()=>configureDesign(design,{width,height,bgColor:'#ffffff'}),/Dimensões permitidas/);
 assert.deepEqual(design,before);
});

test('saved guides retain document coordinates and scale with a resized artboard',()=>{
 const design={...createDesign(),guides:{x:[540,100,100,-1,NaN],y:[900,1080,2000]}};
 const valid=validateDesign(design);
 assert.deepEqual(valid.guides,{x:[100,540],y:[900,1080]});
 const resized=configureDesign(valid,{width:540,height:2160,bgColor:'#ffffff'});
 assert.deepEqual(resized.guides,{x:[50,270],y:[1800,2160]});
 assert.deepEqual(valid.guides,{x:[100,540],y:[900,1080]},'resizing preserves the previous version for undo');
});
