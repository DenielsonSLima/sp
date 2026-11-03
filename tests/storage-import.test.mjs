import test from 'node:test';import assert from 'node:assert/strict';import {deflateSync} from 'node:zlib';
import {inspectTransparentPng} from '../scripts/import-product-storage.mjs';
const crc32=bytes=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let bit=0;bit<8;bit++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
function png({width=1024,height=1024,opaque=false,empty=false,subFilter=false}={}){
 const chunk=(kind,data)=>{const type=Buffer.from(kind),head=Buffer.alloc(4),crc=Buffer.alloc(4);head.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([head,type,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++){const row=Buffer.alloc(width*4);for(let x=0;x<width;x++){row[x*4]=240;row[x*4+1]=20;row[x*4+2]=10;row[x*4+3]=!empty&&(opaque||x>width/4&&x<width*.75&&y>height/4&&y<height*.75)?255:0;}const offset=y*(width*4+1);raw[offset]=subFilter?1:0;for(let x=0;x<row.length;x++)raw[offset+x+1]=subFilter?(row[x]-(x>=4?row[x-4]:0)+256)&255:row[x];}
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
test('importer verifies real alpha pixels and PNG row unfiltering',()=>{for(const subFilter of [false,true]){const result=inspectTransparentPng(png({subFilter}));assert.equal(result.width,1024);assert.equal(result.height,1024);assert.ok(result.transparentFraction>.7&&result.transparentFraction<.8);}});
test('importer rejects opaque white-style backgrounds, empty images and small files',()=>{assert.throws(()=>inspectTransparentPng(png({opaque:true})),/transparência real/);assert.throws(()=>inspectTransparentPng(png({empty:true})),/produto visível/);assert.throws(()=>inspectTransparentPng(png({width:512})),/1024/);assert.throws(()=>inspectTransparentPng(Buffer.from('not a PNG')),/PNG válido/);});
