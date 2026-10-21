import {awardedByProvider,isProviderFinalized,lineTotal,money,parseQuantity,validDate} from './state.js';
import {unitLabel} from '../cadastros/unidades/state.js';
import {createPdfBytes,renderPdfPreviewPage} from '../promocoes/pdf.js';

const WIDTH=1488,HEIGHT=2105,MARGIN=100;
const checkedText=(value,label)=>{if(typeof value!=='string'||!value.trim()||value.length>300)throw Error(`${label} inválido no PDF.`);return value.trim();};
export function approvedSupplierReport(q,providerId){
 if(!q||!validDate(q.date))throw Error('Data inválida no PDF.');
 const title=checkedText(q.title,'Título');
 const provider=isProviderFinalized(q,providerId)?q.finalizedProviders[providerId]:awardedByProvider(q).find(provider=>provider.id===providerId);
 if(!provider)throw Error('Fornecedor inválido no PDF.');
 if(!provider.items.length)throw Error('Este fornecedor ainda não tem produtos aprovados.');
 if(provider.items.length>500)throw Error('O PDF permite até 500 produtos por fornecedor.');
 const items=provider.items.map(item=>{
  const name=checkedText(item.name,'Produto'),quantity=parseQuantity(item.quantity);
  if(!Number.isSafeInteger(item.unitPrice)||item.unitPrice<=0)throw Error('Preço aprovado inválido no PDF.');
  const total=lineTotal(item.unitPrice,quantity);
  if(!Number.isSafeInteger(total)||total<=0)throw Error('Total aprovado inválido no PDF.');
  return {id:item.id,name,quantity,unit:unitLabel(item.unit),unitPrice:item.unitPrice,total};
 });
 const total=items.reduce((sum,item)=>sum+BigInt(item.total),0n);
 if(total>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Total acima do limite do PDF.');
 return {id:String(q.id||'cotacao'),title,date:q.date,provider:{id:String(provider.id),name:checkedText(provider.name,'Fornecedor')},finalized:q.status==='finished'||isProviderFinalized(q,providerId),items,total:Number(total)};
}

function wrap(ctx,value,width){
 const lines=[];let line='';
 for(const word of String(value).replace(/\s+/g,' ').trim().split(' ')){
  const next=line?`${line} ${word}`:word;
  if(ctx.measureText(next).width<=width){line=next;continue;}
  if(line){lines.push(line);line='';}
  for(const char of word){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}
 }
 if(line)lines.push(line);
 return lines.length?lines:[''];
}

export async function generateSupplierQuotePdfs(q,providerId){
 const report=approvedSupplierReport(q,providerId);
 if(typeof document==='undefined')throw Error('O PDF precisa de um navegador com Canvas.');
 if(document.fonts)await document.fonts.ready;
 const group={widthMm:210,heightMm:297,pages:[]},images=new Map();
 const right=WIDTH-MARGIN,bottom=HEIGHT-MARGIN-50,columns=[MARGIN,MARGIN+540,MARGIN+780,MARGIN+1020,right];
 let canvas,ctx,y,pageNo=0,totalBytes=0;
 const font=(size=22,bold=false)=>ctx.font=`${bold?700:400} ${size}px Arial, sans-serif`;
 const draw=(text,x,top,{size=22,bold=false,color='#27313b',align='left'}={})=>{font(size,bold);ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='top';ctx.fillText(text,x,top);};
 const header=()=>{
  canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Canvas indisponível para o PDF.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,WIDTH,HEIGHT);pageNo++;
  draw('SUPERMERCADO DO POVO',MARGIN,MARGIN,{size:28,bold:true,color:'#b71927'});
  draw('COTAÇÃO - PRODUTOS APROVADOS',MARGIN,MARGIN+46,{size:31,bold:true});
  draw(`Data: ${report.date.split('-').reverse().join('/')}  |  ${report.finalized?'Fornecedor finalizado':'Em andamento'}`,MARGIN,MARGIN+96,{size:21,color:'#65717d'});
  y=MARGIN+138;
  for(const text of [`Cotação: ${report.title}`,`Fornecedor: ${report.provider.name}`]){
   font(22,true);const lines=wrap(ctx,text,right-MARGIN);
   lines.forEach(line=>{draw(line,MARGIN,y,{size:22,bold:true});y+=30;});y+=7;
  }
  ctx.fillStyle='#f0f2f5';ctx.fillRect(MARGIN,y,right-MARGIN,46);
  ['PRODUTO','QUANTIDADE','VALOR UNITÁRIO','VALOR TOTAL'].forEach((title,index)=>draw(title,columns[index]+12,y+12,{size:18,bold:true}));
  y+=60;
 };
 const finish=async()=>{
  draw('Produtos aprovados para este fornecedor.',MARGIN,HEIGHT-MARGIN+8,{size:17,color:'#727d87'});
  draw(`Página ${pageNo}`,right,HEIGHT-MARGIN+8,{size:17,color:'#727d87',align:'right'});
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
  if(!blob||blob.type!=='image/jpeg')throw Error('Não foi possível gerar a página do PDF.');
  totalBytes+=blob.size;if(totalBytes>50000000)throw Error('O PDF ultrapassa 50 MB.');
  const token={page:pageNo};images.set(token,{bytes:new Uint8Array(await blob.arrayBuffer()),width:WIDTH,height:HEIGHT});
  group.pages.push([{offer:token,xMm:0,yMm:0,widthMm:210,heightMm:297}]);canvas.width=canvas.height=1;
 };
 const need=async height=>{if(y+height>bottom){await finish();if(pageNo>=100)throw Error('O PDF ultrapassa 100 páginas.');header();}};
 try{
  header();
  for(const item of report.items){
   font(22);const values=[item.name,`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(item.quantity)} ${item.unit}`,money(item.unitPrice),money(item.total)];
   const cells=values.map((value,index)=>wrap(ctx,value,columns[index+1]-columns[index]-24));
   const height=Math.max(...cells.map(cell=>cell.length))*31+27;
   await need(height);
   cells.forEach((cell,index)=>cell.forEach((line,row)=>draw(line,columns[index]+12,y+row*31,{size:22})));
   y+=height;ctx.fillStyle='#e6e9ed';ctx.fillRect(MARGIN,y-11,right-MARGIN,1);
  }
  await need(150);y+=16;ctx.fillStyle='#fff2f2';ctx.fillRect(MARGIN,y,right-MARGIN,86);
  draw('TOTAL APROVADO',MARGIN+18,y+27,{size:24,bold:true,color:'#991d2a'});
  draw(money(report.total),right-18,y+24,{size:31,bold:true,color:'#991d2a',align:'right'});
  draw(`${report.items.length} produto(s) aprovado(s)`,MARGIN,y+108,{size:21,color:'#65717d'});
  await finish();
 }catch(error){if(canvas)canvas.width=canvas.height=1;throw error;}
 const bytes=createPdfBytes(group,images),previewPages=[];
 for(const page of group.pages){const preview=await renderPdfPreviewPage(group,page,images);totalBytes+=preview.size;if(totalBytes>60000000)throw Error('As prévias ultrapassam o limite do PDF.');previewPages.push(preview);}
 const safe=value=>value.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)||'fornecedor';
 return [{name:`cotacao-${safe(report.id)}-${safe(report.provider.id)}.pdf`,blob:new Blob([bytes],{type:'application/pdf'}),pages:group.pages.length,formatLabel:'A4 retrato - produtos aprovados',previewPages}];
}
