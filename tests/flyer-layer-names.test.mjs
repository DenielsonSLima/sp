import test from 'node:test';
import assert from 'node:assert/strict';
import {layerName} from '../interno/encartes/layers-panel.js';
test('layers keep library names and distinguish unnamed images, empty text and shape layers',()=>{
 assert.equal(layerName({type:'image',label:'Logo do supermercado'},2),'Logo do supermercado');
 assert.equal(layerName({type:'image'},1),'Imagem 2');
 assert.equal(layerName({type:'text',text:'  Oferta de Natal  '},0),'Oferta de Natal');
 assert.equal(layerName({type:'text',text:'  '},0),'Texto sem conteúdo');
 assert.equal(layerName({type:'shape'},0),'Faixa de cor');
});
