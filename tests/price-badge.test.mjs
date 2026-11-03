import test from 'node:test';
import assert from 'node:assert/strict';
import { priceBadgeLayout, drawPriceBadge, upgradePriceBadge } from '../interno/encartes/price-badge.js';
import { renderDesign } from '../interno/encartes/renderer.js';
import { createDesign, validateDesign, createHistory } from '../interno/encartes/model.js';
import { priceBadgeControls, applyPriceBadgeControls } from '../interno/encartes/editor/price-badge-controls.js';
const element = { id: 'price', type: 'text', offerField: 'price', offerProductId: 'product', x: 10, y: 20, width: 245, height: 245, text: 'R$ 12,90', color: '#fffaf1', fontFamily: 'Arial', fontWeight: 900, priceBadge: { fill: '#183f35', border: true, borderColor: '#b8a06a', borderWidth: 4, unit: 'cada' } };
function context() {
  const calls=[];
  return { calls, font:'', measureText(text) {return {width:text.length * Number(/ ([\d.]+)px/.exec(this.font)?.[1] || 12) * .6};},
    beginPath(){}, ellipse(...args){calls.push(['ellipse',...args]);}, fill(){calls.push(['fill']);}, stroke(){calls.push(['stroke']);},
    fillText(...args){calls.push(['text',...args]);} };
}
test('badge price scales with the circle, currency stays smaller and values fit without wrapping', () => {
  for (const width of [100,245,500]) for (const text of ['R$ 9,90','R$ 123,45','R$ 1.234,56','R$ —,—','R$ sob consulta']) {
    const parts=priceBadgeLayout(context(),{...element,width,height:width,text});
    assert(parts[0].size < parts[1].size);
    assert.equal(parts[0].y,parts[1].y);
    assert(parts.every(p=>p.x>=0 && p.x+p.width<=width));
    assert(Math.abs(parts[0].x-(width-parts.at(-1).x-parts.at(-1).width))<.001);
  }
  const small=priceBadgeLayout(context(),element),large=priceBadgeLayout(context(),{...element,width:490,height:490});
  assert.equal(large[1].size,small[1].size*2);
});
test('fill, border and unit can be removed independently; renderer uses the requested colors', () => {
  const ctx=context();drawPriceBadge(ctx,element);
  assert(ctx.calls.some(c=>c[0]==='fill'));assert(ctx.calls.some(c=>c[0]==='stroke'));
  assert.equal(ctx.strokeStyle,'#b8a06a');assert.equal(ctx.lineWidth,4);
  const clear=context();drawPriceBadge(clear,{...element,priceBadge:{...element.priceBadge,border:false,transparent:true,unit:''}});
  assert(!clear.calls.some(c=>c[0]==='fill'||c[0]==='stroke'));
  assert.deepEqual(clear.calls.filter(c=>c[0]==='text').map(c=>c[1]),['R$','12',',90']);
});
test('badge controls persist appearance through validation and history without sharing nested state', () => {
  const item=structuredClone(element);
  applyPriceBadgeControls(item,{badgeFill:'#123456',badgeBorderColor:'#654321',badgeBorderWidth:'8',badgeUnit:'por kg',fontFamily:'Arial',fontWeight:'900',color:'#ffffff'}, {elements:{badgeTransparent:{checked:false},badgeBorder:{checked:false}}});
  const d=validateDesign({...createDesign(),elements:[item]});
  assert.equal(d.elements[0].priceBadge.border,false);assert.equal(d.elements[0].priceBadge.fill,'#123456');
  assert.equal(d.elements[0].priceBadge.unit,'por kg');
  const history=createHistory(d);d.elements[0].priceBadge.fill='#000000';history.commit(d);
  assert.equal(history.undo().elements[0].priceBadge.fill,'#123456');
  const html=priceBadgeControls(d.elements[0],()=>'<option>Arial</option>');
  assert.match(html,/Mostrar borda/);assert.match(html,/Remover fundo/);
});
test('explicit legacy conversion preserves edited price and color and can be undone', () => {
  const d=createDesign();d.elements=[
    {...element,priceBadge:undefined,x:27,y:98,width:210,height:85},
    {id:'circle',type:'shape',label:'Selo do preço 1',shapeKind:'ellipse',x:10,y:20,width:245,height:245,fill:'#ba1600'},
    {id:'unit',type:'text',offerField:'unit',offerProductId:'product',text:'cada'},
    {id:'other',type:'text',text:'Outra edição'},
  ];
  const before=structuredClone(d), history=createHistory(d);
  assert(upgradePriceBadge(d,'price'));
  assert.equal(d.elements.length,2);assert.equal(d.elements[0].text,'R$ 12,90');
  assert.equal(d.elements[0].priceBadge.fill,'#ba1600');assert.equal(d.elements[0].priceBadge.border,false);
  assert.equal(d.elements[0].width,245);assert.equal(d.elements[1].text,'Outra edição');
  history.commit(d);assert.deepEqual(history.undo(),before);assert(history.redo().elements[0].priceBadge);
  assert(!upgradePriceBadge(d,'price'));
  const locked=structuredClone(before);locked.elements[1].locked=true;assert(!upgradePriceBadge(locked,'price'));
});

test('shared preview and PNG renderer draws currency, integer and cents separately', async () => {
  const ctx=context();
  for(const method of ['scale','fillRect','save','restore','translate','rect','clip'])ctx[method]=()=>{};
  const canvas={getContext:()=>ctx};
  await renderDesign(canvas,{width:1080,height:1920,elements:[element]});
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='text').map(c=>c[1]),['R$','12',',90','cada']);
  assert.equal(canvas.width,1080);assert.equal(canvas.height,1920);
});
