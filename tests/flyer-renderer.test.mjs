import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {renderDesign, wrapText, validateCanvasSize, fitTextLayout} from '../interno/encartes/renderer.js';
import {createPngBlob} from '../interno/encartes/export.js';
const require = createRequire(import.meta.url);
let native;
try { native = require('@napi-rs/canvas'); } catch { /* Native visual checks are optional on developer machines. */ }

const design = (elements = []) => ({id:'qa', title:'Ofertas', status:'draft', width:600, height:800, bgColor:'#ffe700', elements});
const shape = (overrides = {}) => ({id:'shape', type:'shape', x:10, y:10, width:100, height:100, locked:false, fill:'#ff0000', ...overrides});
const pixel = (canvas, x, y) => Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data);

test('validates declared size and pixel limits', () => {
  validateCanvasSize(1080,1920);
  for (const [w,h] of [[0,100], [1.5,100], [4097,10], [4096,4096], [NaN,20]]) assert.throws(() => validateCanvasSize(w,h));
});

test('word wrapping preserves explicit lines and splits long words', () => {
  const ctx = {measureText: text => ({width:Array.from(text).length * 10})};
  assert.deepEqual(wrapText(ctx,'Bom preço\nHoje',90), ['Bom preço','Hoje']);
  assert.deepEqual(wrapText(ctx,'abcdefgh',30), ['abc','def','gh']);
});

test('automatic text fitting keeps long product names inside the available card area', () => {
  const ctx = { measureText(value) { return { width: Array.from(value).length * Number(this.font.match(/([\d.]+)px/)[1]) * 0.6 }; } };
  const value = 'LEITE CONDENSADO SEMIDESNATADO PIRACANJUBA 395G E EMBALAGEM ECONÔMICA';
  const result = fitTextLayout(ctx, value, 180, 36, { size: 44, autoFit: true });
  assert.ok(result.size < 44);
  assert.ok(result.lines.length * result.lineHeight <= 36);
  assert.equal(result.lines.join(' '), value);
  assert.ok(result.lines.every(line => ctx.measureText(line).width <= 180));
  const longWord = 'SUPERCALIFRAGILISTICO'.repeat(4);
  const split = fitTextLayout(ctx, longWord, 90, 45, { size: 28, autoFit: true });
  assert.equal(split.lines.join(''), longWord);
  assert.ok(split.lines.length * split.lineHeight <= 45);
});

test('price fitting keeps the currency, complete amount and decimals on a single line', () => {
  const ctx = { measureText(value) { return { width: Array.from(value).length * Number(this.font.match(/([\d.]+)px/)[1]) * 0.6 }; } };
  for (const value of ['R$ 1.299,99', 'R$ 99,90']) {
    const result = fitTextLayout(ctx, value, 72, 16, { size: 50, singleLine: true });
    assert.deepEqual(result.lines, [value]);
    assert.ok(result.lineHeight <= 16);
    assert.ok(value.length * result.size * 0.6 <= 72.00001);
  }
});

test('renderer respects dimensions, background, stacking, clipping and scale', {skip:!native}, async () => {
  const canvas = native.createCanvas(1,1);
  await renderDesign(canvas,design([shape(),shape({x:50,y:50,fill:'#0000ff'}),shape({x:580,y:780,width:200,height:200,fill:'#00ff00'})]));
  assert.equal(canvas.width,600); assert.equal(canvas.height,800);
  assert.deepEqual(pixel(canvas,0,0),[255,231,0,255]);
  assert.deepEqual(pixel(canvas,20,20),[255,0,0,255]);
  assert.deepEqual(pixel(canvas,60,60),[0,0,255,255]);
  assert.deepEqual(pixel(canvas,599,799),[0,255,0,255]);
  await renderDesign(canvas,design(),{scale:.5});
  assert.equal(canvas.width,300); assert.equal(canvas.height,400);
});

test('external or missing images fail explicitly before mutating canvas', {skip:!native}, async () => {
  const canvas=native.createCanvas(2,2);
  for (const src of ['https://example.com/photo.jpg','', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    await assert.rejects(renderDesign(canvas,design([{...shape(),type:'image',src}])));
    assert.equal(canvas.width,2);
  }
});

test('renders embedded photos, professional product text and actual-size PNG', {skip:!native}, async () => {
  const previousImage=globalThis.Image;
  const previousDocument=globalThis.document;
  globalThis.Image=native.Image;
  const photo=native.createCanvas(200,120);
  const p=photo.getContext('2d'); p.fillStyle='#8daf39'; p.fillRect(0,0,200,120); p.fillStyle='#fff'; p.font='bold 25px Arial'; p.fillText('PRODUTO',30,70);
  const qa=design([
    shape({x:0,y:0,width:600,height:150,fill:'#b91420'}),
    {...shape(),type:'text',x:25,y:22,width:550,height:100,text:'OFERTAS DO POVO',fontFamily:'Arial',fontSize:44,fontWeight:'bold',color:'#ffffff',align:'center'},
    ...Array.from({length:4},(_,i)=>({...shape(),id:`product-${i}`,type:'product',x:25+(i%2)*285,y:180+Math.floor(i/2)*300,width:265,height:280,name:['Arroz branco tipo 1 pacote 5 kg','Feijão carioca selecionado','Café torrado e moído','Açúcar cristal'][i],priceText:['R$ 19,90','R$ 7,99','R$ 12,90','R$ 4,49'][i],unit:'cada unidade',image:photo.toDataURL('image/png'),background:'#ffffff',textColor:'#171717',priceColor:'#c51624',fontFamily:'Arial'}))
  ]);
  try {
    const canvas=native.createCanvas(1,1);
    await renderDesign(canvas,qa);
    assert.deepEqual(pixel(canvas,140,210),[141,175,57,255]);
    await writeFile('/tmp/flyer-renderer-qa.png',canvas.toBuffer('image/png'));
    globalThis.document={fonts:{ready:Promise.resolve()},createElement:tag=>{
      assert.equal(tag,'canvas');
      const c=native.createCanvas(1,1);
      c.toBlob=callback=>callback(new Blob([c.toBuffer('image/png')],{type:'image/png'}));
      return c;
    }};
    const blob=await createPngBlob(qa);
    assert.equal(blob.type,'image/png'); assert.ok(blob.size>1000);
    const bytes=Buffer.from(await blob.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16),600); assert.equal(bytes.readUInt32BE(20),800);
  } finally {
    globalThis.Image=previousImage;
    globalThis.document=previousDocument;
  }
});

test('invalid elements and preview scales produce visible errors', {skip:!native}, async () => {
  const canvas=native.createCanvas(1,1);
  await assert.rejects(renderDesign(canvas,design([shape({width:-1})])));
  await assert.rejects(renderDesign(canvas,design([shape({type:'unknown'})])));
  await assert.rejects(renderDesign(canvas,design(),{scale:0}));
});

test('downloads JSON backups and PNG artwork with matching extensions', async () => {
  const {downloadBlob} = await import('../interno/encartes/export.js');
  const oldDocument=globalThis.document, oldTimeout=globalThis.setTimeout;
  const clicked=[];
  globalThis.document={body:{append(){}},createElement:()=>({style:{},click(){clicked.push(this.download);},remove(){}})};
  globalThis.setTimeout=fn=>{fn();return 0;};
  try {
    downloadBlob(new Blob(['{}'],{type:'application/json'}),'minha-arte.json');
    downloadBlob(new Blob(['{}'],{type:'application/json;charset=utf-8'}),'backup.png');
    downloadBlob(new Blob(['png'],{type:'image/png'}),'ofertas.png');
    assert.deepEqual(clicked,['minha-arte.json','backup.json','ofertas.png']);
  } finally {globalThis.document=oldDocument;globalThis.setTimeout=oldTimeout;}
});

test('every font offered by the model reaches canvas without silent substitution', async () => {
  const {FONT_FAMILIES}=await import('../interno/encartes/model.js');
  const fonts=[];
  const ctx={scale(){},fillRect(){},save(){},restore(){},translate(){},beginPath(){},rect(){},clip(){},measureText:()=>({width:10}),fillText(){fonts.push(this.font);}};
  const canvas={getContext:()=>ctx};
  for (const family of FONT_FAMILIES) {
    await renderDesign(canvas,design([{...shape(),type:'text',text:'Oferta',fontFamily:family,fontSize:20}]));
    assert.ok(fonts.at(-1).includes(family),`${family}: ${fonts.at(-1)}`);
  }
  assert.ok(fonts.at(-1).endsWith('px serif'));
});

test('bundled logo uses the intended source crop without changing the asset', {skip:!native}, async () => {
  const oldImage=globalThis.Image;
  globalThis.Image=native.Image;
  const calls=[];
  const ctx={scale(){},fillRect(){},save(){},restore(){},translate(){},beginPath(){},rect(){},clip(){},drawImage(...args){calls.push(args);}};
  try {
    await renderDesign({getContext:()=>ctx},design([{...shape(),type:'image',src:'./assets/logo-original.jpg',width:300,height:120}]));
    assert.equal(calls.length,1);
    assert.deepEqual(calls[0].slice(1),[110,380,750,300,0,0,300,120]);
  } finally {globalThis.Image=oldImage;}
});
