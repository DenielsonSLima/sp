import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultTemplates} from './fixtures/legacy-catalogs/modelos-cartaz/model.js';
import {planCampaignPdfs,createPdfBytes,generateCampaignPdfs,renderPosterJpeg,PDF_DPI,MAX_CANVAS_PIXELS} from '../interno/promocoes/pdf.js';
const item=(size=1,quantity=1,printLayout='individual')=>({id:'a',name:'Arroz branco 1 kg',cents:499,unit:'kg',quantity,printLayout,templateSnapshot:defaultTemplates()[size]});
const campaign=items=>({name:'Promoção da semana',start:'2026-10-20',end:'2026-10-27',items});
const jpeg={bytes:new Uint8Array([255,216,255,217]),width:100,height:200};
const bytesFor=g=>createPdfBytes(g,new Map(g.pages.flat().map(p=>[p.offer,jpeg])));
test('PDF grouping keeps dimensions and slots separate, expands quantities and packs across products',()=>{
 const groups=planCampaignPdfs(campaign([item(1,3,'two-a4'),item(1,2,'two-a4'),item(1,2),item(0),item(2)]));
 assert.equal(groups.length,4);assert.equal(groups[0].count,5);assert.deepEqual(groups[0].pages.map(p=>p.length),[2,2,1]);assert.equal(groups[1].pages.length,2);
 assert.deepEqual(groups[0].pages[0].map(p=>[p.xMm,p.yMm,p.widthMm,p.heightMm]),[[.25,0,148,210],[148.75,0,148,210]]);
 assert.equal(groups[0].widthMm,297);assert.equal(groups[0].heightMm,210);
 assert.equal(groups[0].name,'Promocao-da-semana-two-a4-297x210.pdf');
 assert.equal(groups[0].pages[0][0].offer.start,'2026-10-20');
});
test('custom portrait prints at original dimensions and rejects oversized two-up without rotation',()=>{
 const custom=item();custom.templateSnapshot.widthMm=120;custom.templateSnapshot.heightMm=190;
 const g=planCampaignPdfs(campaign([custom]))[0];assert.equal(g.widthMm,120);assert.equal(g.heightMm,190);
 assert.throws(()=>planCampaignPdfs(campaign([item(2,1,'two-a4')])),/não cabe/);
 custom.templateSnapshot.widthMm=190;custom.templateSnapshot.heightMm=120;
 assert.throws(()=>planCampaignPdfs(campaign([custom])),/retrato/);
});
test('PDF writer has valid byte offsets, media boxes, pages and embedded reusable JPEG',()=>{
 const g=planCampaignPdfs(campaign([item(1,5,'two-a4')]))[0],bytes=bytesFor(g),text=new TextDecoder().decode(bytes);
 assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/Count 3/);assert.equal((text.match(/\/Type \/Page\b/g)||[]).length,3);
 assert.match(text,/\/MediaBox \[0 0 841\.88976 595\.27559\]/);
 assert.equal((text.match(/\/Subtype \/Image/g)||[]).length,1);assert.match(text,/\/Filter \/DCTDecode/);
 assert.match(text,/q 419\.52756 0 0 595\.27559 0\.70866 0 cm \/Im0 Do Q/);
 assert.match(text,/q 419\.52756 0 0 595\.27559 421\.65354 0 cm \/Im1 Do Q/);
 const xref=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(new TextDecoder().decode(bytes.slice(xref,xref+4)),'xref');
 const offsets=text.slice(text.indexOf('0000000000 65535 f ')).split('\n').slice(1).filter(line=>/^\d{10} 00000 n/.test(line));
 offsets.forEach((line,i)=>assert.ok(new TextDecoder().decode(bytes.slice(Number(line.slice(0,10)),Number(line.slice(0,10))+20)).startsWith(`${i+1} 0 obj`)));
 assert.match(text,/%%EOF\n$/);
});
test('validation bounds exports and rejects invalid quantities, dates, prices, layouts',()=>{
 for(const quantity of [0,-1,1.5,NaN,501])assert.throws(()=>planCampaignPdfs(campaign([item(1,quantity)])),/quantidade/);
 assert.throws(()=>planCampaignPdfs(campaign([item(1,201)])),/200 páginas/);
 assert.throws(()=>planCampaignPdfs(campaign([item(1,500,'two-a4'),item(1,1,'two-a4')])),/500 cartazes/);
 assert.throws(()=>planCampaignPdfs({...campaign([item()]),start:'2026-02-30'}),/validade/);
 assert.throws(()=>planCampaignPdfs(campaign([{...item(),cents:0}])),/preço/);
 assert.throws(()=>planCampaignPdfs(campaign([{...item(),printLayout:'rotate'}])),/Distribuição/);
});
test('physical snapshot settings are copied rather than mutated',()=>{
 const input=campaign([item()]);const before=JSON.stringify(input),g=planCampaignPdfs(input)[0];
 assert.equal(JSON.stringify(input),before);assert.notEqual(g.pages[0][0].offer.templateSnapshot,input.items[0].templateSnapshot);
});
test('browser raster export loads chosen fonts, caps pixels, returns real PDF blobs',async()=>{
 const old=globalThis.document,fonts=[],draws=[],canvases=[];
 const context={fillRect(){},strokeRect(){},save(){},beginPath(){},rect(){},clip(){},restore(){},measureText(text){return{width:text.length*10}},fillText(text){draws.push([text,this.font])}};
 globalThis.document={fonts:{ready:Promise.resolve(),load:async font=>{fonts.push(font)}},createElement:()=>{const c={width:0,height:0,getContext:()=>context,toBlob(callback){canvases.push([this.width,this.height]);callback(new Blob([jpeg.bytes],{type:'image/jpeg'}));}};return c;}};
 try{
  const offer=item();offer.templateSnapshot.layout.product.fontFamily='Georgia';
  const result=await generateCampaignPdfs(campaign([offer,item(0)]));assert.equal(result.length,2);
  assert.equal(result[0].blob.type,'application/pdf');assert.ok((await result[0].blob.text()).startsWith('%PDF-1.4'));
  assert.ok(fonts.some(f=>f.includes('Georgia')));assert.ok(draws.some(([t,f])=>t==='ARROZ BRANCO 1 KG'&&f.includes('Georgia')));
  assert.equal(PDF_DPI,300);assert.ok(canvases[0][0]>=148*300/25.4);
  const giant=item();giant.templateSnapshot.widthMm=420;giant.templateSnapshot.heightMm=594;
  await renderPosterJpeg({...giant,start:'2026-10-20',end:'2026-10-27'});
  assert.ok(canvases.at(-1)[0]*canvases.at(-1)[1]<=MAX_CANVAS_PIXELS);
  assert.ok(canvases.at(-1)[0]/420*25.4>=150);
 }finally{globalThis.document=old;}
});

test('campaign displayName preserves Enter and snapshot export survives an empty gallery',async()=>{
 const {wrapPosterText}=await import('../interno/promocoes/pdf.js');
 const {templates}=await import('./fixtures/legacy-catalogs/modelos-cartaz/model.js');
 const saved=[...templates],input=item();input.displayName='Arroz\n\nPremium 1 kg';
 try{templates.splice(0);const g=planCampaignPdfs(campaign([input]))[0];assert.equal(g.pages[0][0].offer.displayName,input.displayName);assert.equal(g.widthMm,148);}finally{templates.splice(0,templates.length,...saved);}
 const ctx={measureText:t=>({width:t.length*10})};
 assert.deepEqual(wrapPosterText(ctx,'ARROZ\n\nPREMIUM 1 KG',200),['ARROZ','','PREMIUM 1 KG']);
 assert.deepEqual(wrapPosterText(ctx,'ARROZ\r\nBRANCO',200),['ARROZ','BRANCO']);
 assert.deepEqual(wrapPosterText(ctx,'ARROZ PREMIUM\n1 KG',70),['ARROZ','PREMIUM','1 KG']);
 assert.throws(()=>planCampaignPdfs(campaign([{...item(),displayName:123}])),/Texto/);
});

test('letter spacing participates in wrapping and fallback glyph placement',async()=>{
 const {measureTrackedText,drawTrackedText,wrapPosterText}=await import('../interno/promocoes/pdf.js');
 const calls=[],ctx={textAlign:'center',measureText:t=>({width:t.length*10}),fillText:(...args)=>calls.push(args)};
 assert.equal(measureTrackedText(ctx,'ABCD',2),48);
 assert.deepEqual(wrapPosterText(ctx,'ABCD',25,2),['AB','CD']);
 drawTrackedText(ctx,'AB',100,50,2);assert.deepEqual(calls,[['A',88,50],['B',100,50]]);assert.equal(ctx.textAlign,'center');
 const native={letterSpacing:'0px',measureText(t){return{width:t.length*(10+parseFloat(this.letterSpacing))}},fillText(){assert.equal(this.letterSpacing,'-1px')}};
 assert.equal(measureTrackedText(native,'9999',-1),36);drawTrackedText(native,',99',0,0,-1);assert.equal(native.letterSpacing,'0px');
});

test('PDF raster honors hidden groups, product patterns, Enter, per-group spacing and line heights',async()=>{
 const original=globalThis.document,seen=[],rects=[];
 const context={letterSpacing:'0px',fillRect(...r){rects.push(r)},strokeRect(){},save(){},beginPath(){},rect(){},clip(){},restore(){},measureText(t){return{width:t.length*(10+parseFloat(this.letterSpacing))}},fillText(t,x,y){seen.push({t,x,y,font:this.font,tracking:parseFloat(this.letterSpacing)})}};
 globalThis.document={createElement(){return{getContext:()=>context,toBlob:cb=>cb(new Blob([jpeg.bytes],{type:'image/jpeg'}))}}};
 try{
  const offer={...item(),displayName:'Arroz\nPremium',start:'2026-10-20',end:'2026-10-27'};
  offer.templateSnapshot.productText='{{produto}}\n1 KG';
  offer.templateSnapshot.layout.headline.hidden=true;offer.templateSnapshot.layout.validity.hidden=true;
  Object.assign(offer.templateSnapshot.layout.product,{lineHeight:2,letterSpacing:.2});
  Object.assign(offer.templateSnapshot.layout.price,{lineHeight:1.5,letterSpacing:-.05});
  await renderPosterJpeg(offer);
  assert.ok(!seen.some(v=>v.t==='OFERTA'||v.t.startsWith('Válido')));
  const lines=['ARROZ','PREMIUM','1 KG'].map(t=>seen.find(v=>v.t===t));assert.ok(lines.every(Boolean));
  const productSize=138*300/25.4*.085;
  assert.ok(Math.abs(lines[1].y-lines[0].y-productSize*2)<.00001);assert.ok(Math.abs(lines[0].tracking-productSize*.2)<.00001);
  const priceSize=138*300/25.4*.29,integer=seen.find(v=>v.t==='4'),cents=seen.find(v=>v.t===',99'),unit=seen.find(v=>v.t==='KG');
  assert.ok(Math.abs(integer.tracking+priceSize*.05)<.00001);assert.ok(Math.abs(cents.tracking+priceSize*.5*.05)<.00001);
  assert.ok(Math.abs(cents.y-integer.y-priceSize*.025)<.00001);assert.ok(Math.abs(unit.y-integer.y-priceSize*(.1167+.525*1.5))<.00001);
  assert.ok(Math.abs(rects.at(-1)[1]-integer.y-priceSize*(.065+.525*1.5))<.00001);
  seen.length=0;Object.values(offer.templateSnapshot.layout).forEach(e=>e.hidden=true);await renderPosterJpeg(offer);assert.equal(seen.length,0);
 }finally{globalThis.document=original;}
});

test('optional raster previews reuse exact embedded JPEGs and physical slots, close bitmaps',async()=>{
 const {renderPdfPreviewPage}=await import('../interno/promocoes/pdf.js');
 const original=globalThis.document,oldBitmap=globalThis.createImageBitmap,draws=[],decoded=[],dimensions=[];let closed=0;
 globalThis.createImageBitmap=async blob=>{decoded.push(new Uint8Array(await blob.arrayBuffer()));return{close(){closed++}}};
 globalThis.document={createElement(){return{getContext:()=>({fillRect(){},strokeRect(){},drawImage(...args){draws.push(args.slice(1))}}),toBlob(cb){dimensions.push([this.width,this.height]);cb(new Blob([jpeg.bytes],{type:'image/jpeg'}))}}}};
 try{
  const group=planCampaignPdfs(campaign([item(1,3,'two-a4')]))[0],images=new Map(group.pages.flat().map(p=>[p.offer,jpeg]));
  const first=await renderPdfPreviewPage(group,group.pages[0],images);await renderPdfPreviewPage(group,group.pages[1],images);
  assert.equal(first.type,'image/jpeg');assert.deepEqual(dimensions,[[1200,848],[1200,848]]);assert.equal(closed,3);
  assert.ok(decoded.every(b=>b.every((v,i)=>v===jpeg.bytes[i])));
  assert.deepEqual(draws[0],[.25*1200/297,0,148*1200/297,848]);
  assert.deepEqual(draws[1],[148.75*1200/297,0,148*1200/297,848]);assert.deepEqual(draws[2],draws[0]);
 }finally{globalThis.document=original;globalThis.createImageBitmap=oldBitmap;}
});

test('visible validity has an inset physical border and padded text; hidden validity has neither',async()=>{
 const {validityFrame}=await import('./fixtures/legacy-catalogs/modelos-cartaz/model.js');
 const original=globalThis.document,strokes=[],clips=[],draws=[];
 const ctx={letterSpacing:'0px',fillRect(){},strokeRect(...rect){strokes.push({rect,width:this.lineWidth,color:this.strokeStyle})},save(){},beginPath(){},rect(...rect){clips.push(rect)},clip(){},restore(){},measureText:t=>({width:t.length*10}),fillText(...args){draws.push(args)}};
 globalThis.document={createElement(){return{getContext:()=>ctx,toBlob:cb=>cb(new Blob([jpeg.bytes],{type:'image/jpeg'}))}}};
 try{
  const offer={...item(),start:'2026-10-20',end:'2026-10-27'};await renderPosterJpeg(offer);
  const t=offer.templateSnapshot,e=t.layout.validity,r=300/25.4,frame=validityFrame(t),stroke=frame.widthMm*r,inset=(frame.widthMm+frame.paddingMm)*r;
  const box={x:5*r+e.x*138*r,y:5*r+e.y*200*r,w:e.w*138*r,h:e.h*200*r};
  assert.equal(strokes.length,1);assert.equal(strokes[0].color,t.color);assert.equal(strokes[0].width,.35*r);
  const expected=[box.x+stroke/2,box.y+stroke/2,box.w-stroke,box.h-stroke];expected.forEach((v,i)=>assert.ok(Math.abs(strokes[0].rect[i]-v)<.00001));
  const inner=clips.at(-1);[box.x+inset,box.y+inset,box.w-2*inset,box.h-2*inset].forEach((v,i)=>assert.ok(Math.abs(inner[i]-v)<.00001));
  const text=draws.find(d=>d[0].startsWith('Válido'));assert.ok(text);assert.ok(text[2]>inner[1]&&text[2]<inner[1]+inner[3]);
  strokes.length=0;draws.length=0;e.hidden=true;await renderPosterJpeg(offer);assert.equal(strokes.length,0);assert.ok(!draws.some(d=>d[0].startsWith('Válido')));
 }finally{globalThis.document=original;}
});
