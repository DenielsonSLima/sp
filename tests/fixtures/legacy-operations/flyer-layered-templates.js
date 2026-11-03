// Explicit legacy visual fixture, excluded from application builds.
import {createProductElement,newId,validateDesign} from '../../../interno/encartes/model.js';

export const layeredTemplates=[
 {id:'festival-acougue',name:'Fim de semana no açougue',productCount:6,category:'Açougue',description:'Fundo vermelho e dourado, selo e seis ofertas em camadas independentes.'},
 {id:'sabor-mercearia',name:'Sabor em destaque',productCount:1,category:'Mercearia',description:'Composição laranja com coração 3D, produto recortado e preço em destaque.'},
 {id:'oferta-relampago',name:'Oferta relâmpago',productCount:1,category:'Laticínios',description:'Azul royal, raio dourado e uma oferta com foto, texto e preço livres.'}
];

export function syncProductTexts(design,product){
 for(const element of design.elements){
  if(element.linkedProductId!==product.id)continue;
  element.text=element.linkedField==='name'?product.name:element.linkedField==='price'?(product.priceText||'R$ —,—'):product.unit;
 }
}

export function updateLinkedProductText(design,element){
 const product=design.elements.find(item=>item.type==='product'&&item.id===element.linkedProductId);
 if(!product)return;
 if(element.linkedField==='name')product.name=element.text.slice(0,180);
 if(element.linkedField==='unit')product.unit=element.text.slice(0,40);
 if(element.linkedField==='price'){
  product.priceText=element.text.slice(0,40);
  const raw=product.priceText.replace(/^R\$\s*/,'').trim();
  if(/^\d+(?:[,.]\d{1,2})?$/.test(raw))product.priceCents=Math.round(Number(raw.replace(',','.'))*100);
  else delete product.priceCents;
 }
}

export function fillTemplateProducts(design,catalog,{preview=false,category=''}={}){
 const next=structuredClone(design);
 const preferred=catalog.filter(p=>!category||p.category===category),pool=preferred.length?preferred:catalog;
 next.elements.filter(e=>e.type==='product'&&e.placeholder).forEach((element,index)=>{
  const product=pool[index%pool.length];if(!product)return;
  Object.assign(element,{name:product.name,image:product.photo||product.image||'',unit:product.unit==='KG'?'kg':'un',placeholder:false,priceText:preview?'R$ 9,99':''});
  delete element.priceCents;syncProductTexts(next,element);
 });
 return validateDesign(next);
}

export function applyLayeredTemplate(input,template){
 const design=validateDesign(input),w=design.width,h=design.height;
 const custom=design.elements.filter(e=>e.type!=='product'&&!e.templatePart&&!e.linkedProductId);
 const products=design.elements.filter(e=>e.type==='product'&&!e.placeholder);
 const count=Math.max(template.productCount,products.length);
 while(products.length<count)products.push({...createProductElement({name:`Produto ${products.length+1}`,unit:'un'},design),placeholder:true});
 const elements=[];
 const image=(label,file,x,y,width,height,locked=false)=>({id:newId(),type:'image',label,src:`./assets/encartes/camadas/${file}.png`,x,y,width,height,locked,fit:label==='Fundo do modelo'?'cover':'contain',templatePart:true});
 const shape=(label,x,y,width,height,fill,shapeKind='rounded')=>({id:newId(),type:'shape',label,x,y,width,height,fill,shapeKind,radius:22,templatePart:true});
 const text=(label,value,x,y,width,height,size,color,extra={})=>({id:newId(),type:'text',label,text:value,x,y,width,height,fontSize:Math.max(8,size),fontFamily:'Arial',fontWeight:900,color,align:'center',templatePart:true,...extra});
 const red=template.id==='festival-acougue',orange=template.id==='sabor-mercearia';
 const background=red?'fundo-vermelho-dourado':orange?'fundo-laranja':'fundo-azul';
 elements.push(image('Fundo do modelo',background,0,0,w,h,true));
 if(red){
  elements.push(image('Selo do título','selo-vermelho-dourado',w*.22,h*.015,w*.56,h*.26));
  elements.push(text('Título superior','FIM DE SEMANA',w*.08,h*.065,w*.84,h*.07,Math.min(w*.068,h*.055),'#ffffff',{shadow:true}));
  elements.push(text('Chamada principal','DE OFERTAS',w*.08,h*.14,w*.84,h*.105,Math.min(w*.1,h*.08),'#ffcf37',{strokeWidth:2,strokeColor:'#ffffff',shadow:true}));
  elements.push(shape('Área das ofertas',w*.025,h*.30,w*.95,h*.62,'#fff9ef'));
 }else{
  elements.push(text('Título superior',orange?'SABOR QUE':'OFERTA',w*.06,h*.065,w*.88,h*.075,Math.min(w*.078,h*.06),'#ffffff',{shadow:true}));
  elements.push(text('Chamada principal',orange?'VALE A PENA':'RELÂMPAGO',w*.05,h*.14,w*.9,h*.09,Math.min(w*.092,h*.075),'#ffdf34',{shadow:true}));
  elements.push(image(orange?'Balão com coração':'Raio dourado',orange?'balao-coracao':'raio-dourado',w*.77,h*.21,w*.18,h*.18));
 }
 const top=red?h*.32:h*.29,bottom=h*.90,margin=w*.05,gap=Math.min(w,h)*.02,gridW=w-margin*2,gridH=bottom-top;
 let columns=1,best=Infinity;
 for(let c=1;c<=count;c++){const r=Math.ceil(count/c),cw=(gridW-gap*(c-1))/c,ch=(gridH-gap*(r-1))/r;if(cw<=0||ch<=0)continue;const score=Math.abs(Math.log(cw/ch/.88))+(r*c-count)/count*1.5;if(score<best){best=score;columns=c;}}
 const rows=Math.ceil(count/columns),cw=(gridW-gap*(columns-1))/columns,ch=(gridH-gap*(rows-1))/rows;
 products.forEach((p,index)=>{
  const x=margin+(index%columns)*(cw+gap),y=top+Math.floor(index/columns)*(ch+gap);
  const product={...p,layout:'photo',transparent:true,label:`Foto: ${p.name}`,x:x+cw*.07,y,width:cw*.86,height:ch*.60,rotation:0,flipX:false,flipY:false};elements.push(product);
  const textColor=red?'#681c21':'#ffffff';
  const link=field=>({linkedProductId:product.id,linkedField:field});
  elements.push(text(`Nome: ${p.name}`,p.name,x+cw*.03,y+ch*.61,cw*.94,ch*.13,Math.min(cw*.064,ch*.063),textColor,{...link('name'),fontWeight:700,autoFit:true}));
  const bx=x+cw*.08,by=y+ch*.77,bw=cw*.84,bh=ch*.20;
  elements.push(shape('Etiqueta de preço',bx,by,bw,bh,red?'#103d62':'#ffda36'));
  elements.push(text('Preço do produto',p.priceText||'R$ —,—',bx+bw*.04,by+bh*.08,bw*.78,bh*.86,Math.min(bw*.20,bh*.68),red?'#ffffff':'#af1824',{...link('price'),autoFit:true}));
  elements.push(text('Unidade',p.unit,bx+bw*.81,by+bh*.53,bw*.15,bh*.35,Math.min(bw*.065,bh*.24),red?'#ffdd55':'#a61a22',link('unit')));
 });
 elements.push(text('Nome da loja','SUPERMERCADO DO POVO',w*.06,h*.935,w*.88,h*.032,Math.min(w*.033,h*.023),'#ffffff'));
 elements.push(text('Validade e condições','Consulte a validade e a disponibilidade na loja.',w*.06,h*.974,w*.88,h*.022,Math.min(w*.017,h*.013),'#ffffff',{fontWeight:400}));
 return validateDesign({...design,title:design.title==='Nova arte'?template.name:design.title,bgColor:red?'#a81019':orange?'#ff7800':'#052985',elements:[...elements,...custom]});
}
