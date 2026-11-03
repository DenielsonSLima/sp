// Explicit legacy fixtures for regression tests only. Never imported by the application.
import {validDate} from './hortifruti-model.js';
import {createPdfBytes,renderPdfPreviewPage} from '../../../interno/promocoes/pdf.js';
const WIDTH=1488,HEIGHT=2105,SCALE=WIDTH/210,MARGIN=14*SCALE;
const text=value=>String(value??'');
const safeNumber=(value,label)=>{if(value!=null&&(!Number.isSafeInteger(value)||value<0))throw Error(`${label} inválido no relatório.`);return value??null;};
export function reportDecimal(value,places=6,minPlaces=0){
 if(value==null)return '';safeNumber(value,'Valor');
 const digits=String(value).padStart(places+1,'0'),whole=digits.slice(0,-places).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
 let fraction=digits.slice(-places);while(fraction.length>minPlaces&&fraction.endsWith('0'))fraction=fraction.slice(0,-1);
 return whole+(fraction?','+fraction:'');
}
export function reportWeight(value){
 if(value==null)return '';safeNumber(value,'Peso');
 return reportDecimal(Number((BigInt(value)+5000n)/10000n),2,2);
}
export const reportMoney=value=>value==null?'':`R$ ${reportDecimal(value,2,2)}`;
export function normalizeReportOrder(order){
 if(!order||(order.date!==''&&!validDate(order.date))||!order.partner||typeof order.partner.name!=='string')throw Error('Informe data e parceiro válidos para o relatório.');
 if(!Array.isArray(order.items)||!order.items.length||order.items.length>500)throw Error('O relatório precisa de 1 a 500 produtos.');
 if(text(order.notes).length>10000||text(order.partner.name).length>300)throw Error('Texto acima do limite do relatório.');
 const items=order.items.map(item=>{
  if(typeof item.name!=='string'||!item.name.trim()||item.name.length>300)throw Error('Produto inválido no relatório.');
  if(item.unitSymbol&&item.unitSymbol.toUpperCase()!=='KG')throw Error('O relatório de pesagem usa kg.');
  const unitCount=safeNumber(item.unitCount,'Quantidade');
  const reportQuantity=item.weighMode==='boxes'?(Array.isArray(item.boxes)&&item.boxes.length?item.boxes.length:null):unitCount;
  return {...item,unitCount,reportQuantity,quantityMicros:safeNumber(item.quantityMicros,'Peso'),unitMicros:safeNumber(item.unitMicros,'Custo por kg'),totalCents:safeNumber(item.totalCents,'Total'),boxesIncomplete:!!item.boxesIncomplete};
 });
 const known=items.filter(i=>i.totalCents!=null),total=false?BigInt(order.computed?.summary?.total||0):known.reduce((sum,i)=>sum+BigInt(i.totalCents),0n);
 if(total>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Total acima do limite do relatório.');
 const incomplete=false?(order.computed?.summary?.incomplete||0):items.filter(i=>i.quantityMicros==null||i.unitMicros==null||i.totalCents==null||i.boxesIncomplete).length;
 return {...order,notes:text(order.notes),partner:{...order.partner,name:text(order.partner.name)},items,totalCents:known.length?Number(total):null,incomplete};
}
const wrap=(ctx,value,width)=>{
 const lines=[];for(const paragraph of text(value).replace(/\r\n?/g,'\n').split('\n')){let current='';for(const word of paragraph.split(/\s+/)){const next=current?`${current} ${word}`:word;if(ctx.measureText(next).width<=width){current=next;continue;}if(current){lines.push(current);current='';}for(const char of word){if(current&&ctx.measureText(current+char).width>width){lines.push(current);current='';}current+=char;}}lines.push(current);}return lines;
};
const font=(ctx,size=20,bold=false)=>ctx.font=`${bold?700:400} ${size}px Arial, sans-serif`;

/** Purchase-cost report, deliberately independent of sales poster settings. */
export async function generateOrderReportPdfs(input){
 const order=normalizeReportOrder(input);
 if(typeof document==='undefined')throw Error('O relatório PDF precisa de um navegador com Canvas.');
 if(document.fonts)await document.fonts.ready;
 const group={widthMm:210,heightMm:297,pages:[]},images=new Map();let canvas,ctx,y,pageNo=0,totalBytes=0;
 const left=MARGIN,right=WIDTH-MARGIN,bottom=HEIGHT-MARGIN-45;
 const columns=[left,left+420,left+570,left+780,left+1030,right];
 const draw=(value,x,top,{bold=false,size=20,color='#20272d',align='left'}={})=>{font(ctx,size,bold);ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='top';ctx.fillText(value,x,top);};
 const header=()=>{
  canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas indisponível para o relatório.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,WIDTH,HEIGHT);pageNo++;
  draw('HORTIFRUTI · RELATÓRIO DE COMPRA',left,MARGIN,{size:30,bold:true,color:'#164f38'});
  draw(`Data: ${order.date.split('-').reverse().join('/')}  ·  ${order.status==='finished'?'Finalizada':'Pendente'}`,left,MARGIN+52,{size:21});
  font(ctx,22,true);const names=wrap(ctx,`Parceiro: ${order.partner.name}`,right-left);names.forEach((line,i)=>draw(line,left,MARGIN+89+i*28,{size:22,bold:true}));
  y=MARGIN+105+names.length*28;
  draw('PRODUTO',columns[0]+10,y,{bold:true,size:18});draw('QUANTIDADE',columns[1]+10,y,{bold:true,size:18});draw('PESO (kg)',columns[2]+10,y,{bold:true,size:18});draw('VALOR UNIT. (kg)',columns[3]+10,y,{bold:true,size:18});draw('VALOR TOTAL',columns[4]+10,y,{bold:true,size:18});
  y+=35;ctx.fillStyle='#bacdc2';ctx.fillRect(left,y,right-left,2);y+=12;
 };
 const finish=async()=>{
  draw(`Página ${pageNo} · Valores não informados ficam em branco. Quantidade: caixas ou unidades.`,left,HEIGHT-MARGIN+5,{size:17,color:'#626b65'});
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));if(!blob||blob.type!=='image/jpeg')throw Error('Não foi possível gerar a página do relatório.');
  totalBytes+=blob.size;if(totalBytes>50000000)throw Error('Relatório acima de 50 MB. Divida a compra.');
  const token={page:pageNo};images.set(token,{bytes:new Uint8Array(await blob.arrayBuffer()),width:WIDTH,height:HEIGHT});group.pages.push([{offer:token,xMm:0,yMm:0,widthMm:210,heightMm:297}]);canvas.width=canvas.height=1;
 };
 const need=async height=>{if(y+height>bottom){await finish();if(pageNo>=100)throw Error('Relatório acima de 100 páginas.');header();}};
 try{
  header();
  for(const item of order.items){
   font(ctx,21);const names=wrap(ctx,item.name,columns[1]-columns[0]-24);
   const pending=item.boxesIncomplete?'Pesagem das caixas incompleta':null;if(pending)names.push(pending);
   const values=[item.reportQuantity==null?'':String(item.reportQuantity),reportWeight(item.quantityMicros),item.unitMicros==null?'':`R$ ${reportDecimal(item.unitMicros,6,2)}`,reportMoney(item.totalCents)];
   font(ctx,19);const cells=values.map((v,i)=>wrap(ctx,v,columns[i+2]-columns[i+1]-20));
   const lines=Math.max(names.length,...cells.map(c=>c.length)),height=lines*29+22;
   await need(height);
   names.forEach((line,i)=>draw(line,left+10,y+i*29,{size:21}));
   cells.forEach((cell,i)=>cell.forEach((line,j)=>draw(line,columns[i+1]+10,y+j*29,{size:19})));
   y+=height;ctx.fillStyle='#e3e9e5';ctx.fillRect(left,y-9,right-left,1);
  }
  await need(110);
  draw(order.incomplete?'SUBTOTAL PARCIAL':'SUBTOTAL',left,y+10,{bold:true,size:22});
  draw(reportMoney(order.totalCents),right,y+10,{bold:true,size:26,align:'right'});y+=55;
  if(order.incomplete){draw(`${order.incomplete} produto(s) com peso ou custo a conferir.`,left,y,{size:19,color:'#795422'});y+=40;}
  if(order.notes.trim()){
   await need(75);draw('Observações',left,y,{bold:true,size:22});y+=34;font(ctx,20);
   for(const line of wrap(ctx,order.notes,right-left)){await need(29);draw(line,left,y,{size:20});y+=29;}
  }
  await finish();
 }catch(error){if(canvas)canvas.width=canvas.height=1;throw error;}
 const bytes=createPdfBytes(group,images),previewPages=[];
 for(const page of group.pages){const preview=await renderPdfPreviewPage(group,page,images);totalBytes+=preview.size;if(totalBytes>60000000)throw Error('Prévias acima do limite do relatório.');previewPages.push(preview);}
 return [{name:`hortifruti-${order.date?order.date+'-':''}${text(order.id||'compra').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50)||'compra'}.pdf`,blob:new Blob([bytes],{type:'application/pdf'}),pages:group.pages.length,formatLabel:'A4 retrato · relatório de compra',previewPages}];
}
