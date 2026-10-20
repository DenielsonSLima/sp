import {normalizeTemplate,validDate} from '../cadastros/modelos-cartaz/model.js';

export const PDF_DPI=300;
export const MAX_PDF_PAGES=200;
export const MAX_CANVAS_PIXELS=16000000;
const MM_TO_PT=72/25.4;
const number=n=>Number(n.toFixed(5));
const fileSlug=text=>String(text||'campanha').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'campanha';

/** A deterministic physical-page plan, also usable by campaign previews. */
export function planCampaignPdfs(campaign){
 if(!campaign||!Array.isArray(campaign.items)||!campaign.items.length)throw Error('Adicione produtos à campanha antes de exportar.');
 if(!validDate(campaign.start)||!validDate(campaign.end)||campaign.end<campaign.start)throw Error('Informe a validade da campanha.');
 const groups=new Map();let copies=0;
 for(const item of campaign.items){
  const template=normalizeTemplate(item.templateSnapshot);
  if(typeof item.name!=='string'||!item.name.trim()||item.name.length>300||!Number.isInteger(item.cents)||item.cents<1||item.cents>999999||!['kg','unid'].includes(item.unit))throw Error('Produto ou preço inválido na campanha.');
  if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>500)throw Error('Use uma quantidade inteira de 1 a 500 cartazes.');
  copies+=item.quantity;if(copies>500)throw Error('Exporte no máximo 500 cartazes por campanha.');
  const layout=item.printLayout??'individual';if(!['individual','two-a4'].includes(layout))throw Error('Distribuição de impressão inválida.');
  if(layout==='two-a4'&&(template.widthMm>148.5||template.heightMm>210))throw Error(`O modelo “${template.name}” não cabe em dois espaços A4. Use no máximo 148,5 × 210 mm ou impressão individual.`);
  const widthMm=layout==='two-a4'?297:template.widthMm,heightMm=layout==='two-a4'?210:template.heightMm;
  const key=`${layout}-${widthMm}x${heightMm}`;
  if(!groups.has(key))groups.set(key,{key,widthMm,heightMm,layout,formatLabel:layout==='two-a4'?'A4 paisagem · 2 cartazes':`${widthMm} × ${heightMm} mm · retrato`,pages:[]});
  const group=groups.get(key),slots=layout==='two-a4'?2:1;
  // Reuse the normalized object across copies, so image bytes are embedded once.
  const offer={...item,start:campaign.start,end:campaign.end,templateSnapshot:template};
  for(let i=0;i<item.quantity;i++){
   let page=group.pages.at(-1);if(!page||page.length===slots){page=[];group.pages.push(page);}
   const slotWidth=widthMm/slots;
   page.push({offer,xMm:page.length*slotWidth+(slotWidth-template.widthMm)/2,yMm:(heightMm-template.heightMm)/2,widthMm:template.widthMm,heightMm:template.heightMm});
  }
 }
 if([...groups.values()].reduce((sum,g)=>sum+g.pages.length,0)>MAX_PDF_PAGES)throw Error('Exporte no máximo 200 páginas por vez. Divida a campanha.');
 return [...groups.values()].map(g=>({...g,count:g.pages.reduce((n,p)=>n+p.length,0),name:`${fileSlug(campaign.name)}-${g.key}.pdf`}));
}

function setFont(ctx,size,family,weight=900){ctx.font=`${weight} ${size}px "${family}", sans-serif`;}
function wrapText(ctx,text,width){
 const lines=[];let line='';
 for(const word of text.split(/\s+/)){
  const trial=line?`${line} ${word}`:word;
  if(ctx.measureText(trial).width<=width){line=trial;continue;}
  if(line){lines.push(line);line='';}
  for(const char of word){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}
 }
 if(line)lines.push(line);return lines;
}
function drawText(ctx,text,e,box,size,{weight=900,lineHeight=1.08,spacing=0}={}){
 setFont(ctx,size,e.fontFamily,weight);const lines=wrapText(ctx,text,box.w),lineStep=size*lineHeight;
 ctx.textBaseline='middle';ctx.textAlign=e.align;
 const x=box.x+(e.align==='center'?box.w/2:e.align==='right'?box.w:0);
 // Match the editor's centered, clipped text boxes. No hidden auto-resizing.
 lines.forEach((line,i)=>{
  const y=box.y+box.h/2+(i-(lines.length-1)/2)*lineStep;
  if(spacing&&'letterSpacing' in ctx){ctx.letterSpacing=`${spacing}px`;ctx.fillText(line,x,y);ctx.letterSpacing='0px';}else ctx.fillText(line,x,y);
 });
}
function drawPrice(ctx,offer,e,box,size){
 const parts=(offer.cents/100).toFixed(2).split('.'),currency='R$',cents=','+parts[1],unit=offer.unit==='kg'?'KG':'UN';
 const amountScale=offer.cents>=100000?.70:offer.cents>=10000?.85:1;size*=amountScale;
 setFont(ctx,size,e.fontFamily);const integerWidth=ctx.measureText(parts[0]).width;
 setFont(ctx,size*.14,e.fontFamily,700);const currencyWidth=ctx.measureText(currency).width;
 setFont(ctx,size*.5,e.fontFamily);const sideWidth=Math.max(size*.7,ctx.measureText(cents).width);
 const gap=size*.035,total=currencyWidth+integerWidth+sideWidth+gap*2;
 let x=box.x+(e.align==='center'?(box.w-total)/2:e.align==='right'?box.w-total:0),top=box.y+(box.h-size)/2;
 ctx.textAlign='left';ctx.textBaseline='top';setFont(ctx,size*.14,e.fontFamily,700);ctx.fillText(currency,x,top+size*.797);x+=currencyWidth+gap;
 setFont(ctx,size,e.fontFamily);ctx.fillText(parts[0],x,top);x+=integerWidth+gap;
 ctx.textAlign='center';setFont(ctx,size*.5,e.fontFamily);ctx.fillText(cents,x+sideWidth/2,top+size*.025);
 ctx.fillRect(x,top+size*.59,sideWidth,Math.max(1,size*.0175));
 setFont(ctx,size*.19,e.fontFamily,700);ctx.fillText(unit,x+sideWidth/2,top+size*.65);
}

/** Rasterize with the browser's same font fallback as the model editor, at up to 300 dpi (large custom sheets remain above 150 dpi). */
export async function renderPosterJpeg(offer){
 if(typeof document==='undefined')throw Error('A exportação PDF precisa de um navegador com Canvas.');
 const t=normalizeTemplate(offer.templateSnapshot);
 if(document.fonts){await document.fonts.ready;await Promise.all(Object.values(t.layout).map(e=>document.fonts.load(`900 24px "${e.fontFamily}"`)));}
 const canvas=document.createElement('canvas'),ratio=Math.min(PDF_DPI/25.4,Math.sqrt((MAX_CANVAS_PIXELS-20000)/(t.widthMm*t.heightMm)));
 if(ratio*25.4<150)throw Error('Folha grande demais para exportar com qualidade. Reduza as medidas.');
 canvas.width=Math.ceil(t.widthMm*ratio);canvas.height=Math.ceil(t.heightMm*ratio);
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Este navegador não disponibilizou o Canvas para exportar.');
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
 const inset=5*ratio,w=(t.widthMm-10)*ratio,h=(t.heightMm-10)*ratio;
 ctx.fillStyle=t.background;ctx.fillRect(inset,inset,w,h);ctx.fillStyle=t.color;
 for(const [key,e] of Object.entries(t.layout)){
  const box={x:inset+e.x*w,y:inset+e.y*h,w:e.w*w,h:e.h*h},size=w*e.fontSize/100*t.scale;
  ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();
  if(key==='price')drawPrice(ctx,offer,e,box,size);
  else if(key==='product')drawText(ctx,offer.name.toUpperCase(),e,box,size*(offer.name.length>65?.60:offer.name.length>35?.78:1));
  else if(key==='headline')drawText(ctx,t.headline,e,box,size,{lineHeight:1.1,spacing:size*.1});
  else drawText(ctx,`Válido de ${offer.start.split('-').reverse().join('/')} até ${offer.end.split('-').reverse().join('/')}`,e,box,size,{weight:700,lineHeight:1.4});
  ctx.restore();
 }
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.96));
 if(!blob||blob.type!=='image/jpeg')throw Error('O navegador não conseguiu gerar a imagem JPEG do cartaz.');
 const result={bytes:new Uint8Array(await blob.arrayBuffer()),width:canvas.width,height:canvas.height};
 canvas.width=canvas.height=1;return result;
}

const encode=text=>new TextEncoder().encode(text);
const concat=chunks=>{const out=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;};
/** Small ISO 32000 PDF writer: RGB JPEG XObjects, physical MediaBoxes and byte xref. */
export function createPdfBytes(group,images){
 const objects=[null,null],imageRefs=new Map();
 const add=bytes=>{objects.push(typeof bytes==='string'?encode(bytes):bytes);return objects.length;};
 for(const page of group.pages)for(const placement of page){
  const offer=placement.offer;if(imageRefs.has(offer))continue;
  const image=images.get(offer);if(!image||!(image.bytes instanceof Uint8Array)||image.bytes[0]!==255||image.bytes[1]!==216||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1)throw Error('Imagem JPEG inválida para exportação.');
  const id=add(concat([encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),image.bytes,encode('\nendstream')]));imageRefs.set(offer,id);
 }
 const pageRefs=[];
 for(const page of group.pages){
  const resource=[],commands=[];
  page.forEach((p,i)=>{
   resource.push(`/Im${i} ${imageRefs.get(p.offer)} 0 R`);
   commands.push(`q ${number(p.widthMm*MM_TO_PT)} 0 0 ${number(p.heightMm*MM_TO_PT)} ${number(p.xMm*MM_TO_PT)} ${number((group.heightMm-p.yMm-p.heightMm)*MM_TO_PT)} cm /Im${i} Do Q`);
  });
  const content=encode(commands.join('\n')),contentId=add(concat([encode(`<< /Length ${content.length} >>\nstream\n`),content,encode('\nendstream')]));
  pageRefs.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(group.widthMm*MM_TO_PT)} ${number(group.heightMm*MM_TO_PT)}] /Resources << /XObject << ${resource.join(' ')} >> >> /Contents ${contentId} 0 R >>`));
 }
 objects[0]=encode('<< /Type /Catalog /Pages 2 0 R >>');objects[1]=encode(`<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.map(id=>`${id} 0 R`).join(' ')}] >>`);
 const chunks=[encode('%PDF-1.4\n%PDF raster artwork\n')],offsets=[0];let length=chunks[0].length;
 objects.forEach((object,i)=>{offsets.push(length);const chunk=concat([encode(`${i+1} 0 obj\n`),object,encode('\nendobj\n')]);chunks.push(chunk);length+=chunk.length;});
 chunks.push(encode(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
 return concat(chunks);
}

export async function generateCampaignPdfs(campaign){
 const groups=planCampaignPdfs(campaign),results=[];let outputBytes=0;
 for(const group of groups){
  const images=new Map();let imageBytes=0;
  for(const page of group.pages)for(const placement of page){if(!images.has(placement.offer)){const image=await renderPosterJpeg(placement.offer);imageBytes+=image.bytes.length;if(imageBytes+outputBytes>100000000)throw Error('Os PDFs ultrapassam 100 MB. Divida a campanha em lotes menores.');images.set(placement.offer,image);}}
  const bytes=createPdfBytes(group,images);outputBytes+=bytes.length;
  if(outputBytes>100000000)throw Error('Os PDFs ultrapassam 100 MB. Divida a campanha em lotes menores.');
  results.push({name:group.name,blob:new Blob([bytes],{type:'application/pdf'}),pages:group.pages.length,formatLabel:group.formatLabel});
 }
 return results;
}
