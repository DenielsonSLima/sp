import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultTemplates} from '../interno/cadastros/modelos-cartaz/model.js';
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
 const context={fillRect(){},save(){},beginPath(){},rect(){},clip(){},restore(){},measureText(text){return{width:text.length*10}},fillText(text){draws.push([text,this.font])}};
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
