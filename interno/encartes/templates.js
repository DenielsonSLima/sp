import {createProductElement, newId, validateDesign} from './model.js';
export const templates = [
  {id:'offer-1',name:'Oferta destaque',productCount:1,description:'Um produto em destaque, com cabeçalho vermelho e preço marcante.'},
  {id:'offers-3',name:'Trio de ofertas',productCount:3,description:'Três produtos com espaço para fotos, nomes e preços.'},
  {id:'offers-4',name:'Seleção de 4',productCount:4,description:'Quatro ofertas em uma grade organizada.'},
  {id:'offers-6',name:'Ofertas da semana',productCount:6,description:'Seis produtos com identidade vermelha e amarela.'},
  {id:'offers-9',name:'Festival de ofertas',productCount:9,description:'Nove ofertas para um encarte completo.'}
];
export function applyTemplate(input, templateId) {
  const template = templates.find(t => t.id === templateId);
  if (!template) throw new Error('Modelo de arte não encontrado.');
  const design = validateDesign(input), {width:w,height:h} = design;
  const products = design.elements.filter(e => e.type === 'product' && !e.placeholder);
  const copy = design.elements.filter(e => e.type === 'text');
  const images = design.elements.filter(e => e.type === 'image');
  const shapes = design.elements.filter(e => e.type === 'shape' && !e.templatePart);
  const count = Math.max(template.productCount, products.length);
  while (products.length < count) products.push({...createProductElement({name:`Produto ${products.length + 1}`,unit:'un'}, design),placeholder:true});
  // Select a grid with card proportions close to 0.85, even on tall or wide artboards.
  const margin = Math.min(w,h) * .035, gap = Math.min(w,h) * .018;
  const top = h * .20, bottom = h * .91, gridW = w - margin * 2, gridH = bottom - top;
  let columns = 1, score = Infinity;
  for (let c = 1; c <= count; c++) {
    const rows = Math.ceil(count / c), cw = (gridW - gap * (c - 1)) / c, ch = (gridH - gap * (rows - 1)) / rows;
    if (cw <= 0 || ch <= 0) continue;
    const next = Math.abs(Math.log(cw / ch / .85)) + (rows * c - count) / count * 1.5;
    if (next < score) { score = next; columns = c; }
  }
  const rows = Math.ceil(count / columns), cardW = Math.max(1,(gridW - gap * (columns - 1)) / columns), cardH = Math.max(1,(gridH - gap * (rows - 1)) / rows);
  const shape = (x,y,width,height,fill) => ({id:newId(),type:'shape',x,y,width,height,locked:false,fill,templatePart:true});
  const text = (existing, fallback, y, height, size, color) => ({id:existing?.id || newId(),type:'text',locked:false,text:existing?.text ?? fallback,fontFamily:existing?.fontFamily || 'Arial',fontWeight:existing?.fontWeight || 900,align:'center',x:margin,y,width:w - 2 * margin,height,fontSize:size,color});
  const headerSize = Math.max(12, Math.min(h * .065, w / 17));
  const elements = [
    shape(0,0,w,h * .175,'#c5161d'),
    shape(0,h * .175,w,h * .012,'#ffd52a'),
    shape(0,h * .935,w,h * .065,'#ffd52a'),
    text(copy[0], 'SUPERMERCADO DO POVO', h * .035,h * .11,headerSize,'#ffffff'),
    ...products.map((p,i) => ({...p,x:margin + (i % columns) * (cardW + gap),y:top + Math.floor(i / columns) * (cardH + gap),width:cardW,height:cardH})),
    text(copy[1], 'OFERTAS SUJEITAS À DISPONIBILIDADE • CONFIRA A VALIDADE', h * .948,h * .037,Math.max(8,Math.min(h * .018,w / 65)),'#921319'),
    ...copy.slice(2), ...images, ...shapes
  ];
  return validateDesign({...design,bgColor:'#fff5d6',updatedAt:new Date().toISOString(),elements});
}
