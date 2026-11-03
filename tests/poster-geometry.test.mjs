import {readDomainSource,readDomainStyles,readModuleSource} from './helpers/domain-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rulerTicks,centerElement,snapElementToCenter} from '../interno/cadastros/modelos-cartaz/geometry.js';
import {defaultLayout,defaultTemplates,posterMarkup,sampleOffer,validityFrame,VALIDITY_FRAME} from './fixtures/legacy-catalogs/modelos-cartaz/model.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} != ${b}`);

test('millimetre ruler ticks track full physical sheets accurately at every view scale',()=>{
 for(const mm of [60,105,148,210,297,594,148.5])for(const px of [55,180,310,600,1200]){
  const {ticks}=rulerTicks(mm,px);assert.equal(ticks[0].mm,0);assert.equal(ticks.at(-1).mm,mm);assert.equal(ticks[0].position,0);assert.equal(ticks.at(-1).position,1);assert.ok(ticks.length<=502);
  for(const tick of ticks){assert.ok(tick.position>=0&&tick.position<=1);close(tick.position*px/px*mm,tick.mm);}
 }
 for(const pair of [[0,300],[105,0],[NaN,300],[105,Infinity]])assert.throws(()=>rulerTicks(...pair));
});
test('centering preserves size, typography and bounds while targeting exact sheet centres',()=>{
 const original={...defaultLayout().product,x:.1,y:.2,w:.3,h:.4};
 const horizontal=centerElement(original,'horizontal'),vertical=centerElement(original,'vertical');close(horizontal.x+.15,.5);assert.equal(horizontal.y,.2);close(vertical.y+.2,.5);assert.equal(vertical.x,.1);
 for(const property of ['w','h','fontFamily','fontSize','letterSpacing','lineHeight'])assert.equal(horizontal[property],original[property]);
 for(const widthMm of [60,105,210,420])close(5+(horizontal.x+horizontal.w/2)*(widthMm-10),widthMm/2);
 const full=centerElement({...original,x:0,w:1},'horizontal');assert.equal(full.x,0);assert.equal(full.w,1);
 const hidden={...original,hidden:true};assert.deepEqual(centerElement(hidden,'horizontal'),hidden);assert.throws(()=>centerElement(original,'diagonal'));assert.equal(original.x,.1);
});
test('centre snap uses a constant screen-pixel tolerance rather than fixed model units',()=>{
 const element={...defaultLayout().product,x:.41,y:.2,w:.2,h:.2};
 const small=snapElementToCenter(element,{widthPx:300,heightPx:400});assert.equal(small.guides.vertical,true);close(small.element.x,.4);assert.equal(small.guides.horizontal,false);
 const zoom=snapElementToCenter(element,{widthPx:1000,heightPx:1200});assert.equal(zoom.guides.vertical,false);assert.equal(zoom.element.x,.41);
 for(const widthPx of [100,300,1000]){const near={...element,x:.4+5/widthPx};assert.equal(snapElementToCenter(near,{widthPx,heightPx:400}).guides.vertical,true);const far={...element,x:.4+7/widthPx};assert.equal(snapElementToCenter(far,{widthPx,heightPx:400}).guides.vertical,false);}
 const hidden=snapElementToCenter({...element,hidden:true},{widthPx:300,heightPx:400});assert.deepEqual(hidden.guides,{vertical:false,horizontal:false});assert.equal(hidden.element.x,.41);
 assert.throws(()=>snapElementToCenter(element,{widthPx:0,heightPx:400}));
});
test('snap can centre both axes and never pushes small or full boxes beyond the page',()=>{
 const e={...defaultLayout().product,x:.399,y:.349,w:.2,h:.3};const result=snapElementToCenter(e,{widthPx:500,heightPx:500});assert.deepEqual(result.guides,{vertical:true,horizontal:true});close(result.element.x,.4);close(result.element.y,.35);
 for(const change of [{x:0,y:0,w:1,h:1},{x:.92,y:.965,w:.08,h:.035}]){const next=snapElementToCenter({...e,...change},{widthPx:80,heightPx:100}).element;assert.ok(next.x>=0&&next.y>=0&&next.x+next.w<=1.000001&&next.y+next.h<=1.000001);}
});
test('validity border has real physical width and bounded internal padding without expanding its box',()=>{
 assert.deepEqual(VALIDITY_FRAME,{widthMm:.35,paddingMm:1});
 for(const template of defaultTemplates()){assert.deepEqual(validityFrame(template),{widthMm:.35,paddingMm:1});assert.match(posterMarkup(sampleOffer(template.id),template),/--validity-border-width:/);}
 const short={...defaultTemplates()[0],widthMm:60,heightMm:80};short.layout.validity={...short.layout.validity,x:0,y:0,w:.08,h:.035};const frame=validityFrame(short);assert.ok(frame.paddingMm<1);assert.ok(2*(frame.widthMm+frame.paddingMm)<(short.heightMm-10)*short.layout.validity.h);
 short.layout.validity.hidden=true;assert.ok(!posterMarkup(sampleOffer(short.id),short).includes('data-poster-element="validity"'));
});
test('rulers and guides stay in the editor and lifecycle/centering controls remain wired',async()=>{
 const editor=await readDomainSource('interno/cadastros/modelos-cartaz'),css=await readDomainStyles('interno/cadastros/modelos-cartaz'),model=await readModuleSource('interno/cadastros/modelos-cartaz/presentation.js');
 for(const token of ['poster-ruler-top','poster-ruler-left','snapElementToCenter','data-center="horizontal"','data-center="vertical"','ResizeObserver(paintRulers)','rulerObserver?.disconnect()','button.disabled=element.hidden','paintGuides()'])assert.ok(editor.includes(token),token);
 assert.ok(!model.includes('poster-ruler'));assert.ok(!model.includes('poster-center-guide'));assert.match(css,/poster-alignment-guides\{[^}]*pointer-events:none/);assert.match(css,/poster-validity\{border:calc\(var\(--poster-unit\)\s*\*\s*var\(--validity-border-width\)\) solid currentColor;padding:calc\(var\(--poster-unit\)\s*\*\s*var\(--validity-padding\)\)/);
});
