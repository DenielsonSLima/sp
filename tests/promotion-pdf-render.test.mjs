// Optional integration check against a real Canvas implementation and Poppler.
// CANVAS_MODULE_PATH=/absolute/path/to/@napi-rs/canvas/index.js node --test tests/promotion-pdf-render.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {defaultTemplates} from '../interno/cadastros/modelos-cartaz/model.js';
import {generateCampaignPdfs} from '../interno/promocoes/pdf.js';
test('real Canvas JPEG PDFs parse and rasterize with A4 landscape and portrait MediaBoxes',{skip:!process.env.CANVAS_MODULE_PATH},async()=>{
 const {createCanvas}=await import(process.env.CANVAS_MODULE_PATH),original=globalThis.document,dir=await mkdtemp(join(tmpdir(),'promotion-pdf-'));
 globalThis.document={createElement(){const c=createCanvas(1,1);c.toBlob=callback=>callback(new Blob([c.toBuffer('image/jpeg')],{type:'image/jpeg'}));return c;}};
 try{
  const items=defaultTemplates().map((t,i)=>({name:'Arroz branco 1 kg',cents:499,unit:'kg',quantity:i===1?3:1,printLayout:i===1?'two-a4':'individual',templateSnapshot:t}));
  const results=await generateCampaignPdfs({name:'Prova',start:'2026-10-20',end:'2026-10-27',items});
  for(const [i,result] of results.entries()){
   const path=join(dir,`${i}.pdf`);await writeFile(path,new Uint8Array(await result.blob.arrayBuffer()));
   const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});
   assert.match(info,new RegExp(`Pages:\\s+${i===1?2:1}`));assert.match(info,/PDF version:\s+1.4/);assert.match(info,/Page rot:\s+0/);
   if(i===1)assert.match(info,/Page size:\s+841\.89 x 595\.276 pts/);
   if(i===2)assert.match(info,/Page size:\s+595\.276 x 841\.89 pts/);
   // Decoding each page also catches malformed JPEG streams or XObject references.
   execFileSync('pdftoppm',['-scale-to','300','-png',path,join(dir,`render-${i}`)]);
  }
 }finally{globalThis.document=original;await rm(dir,{recursive:true,force:true});}
});
