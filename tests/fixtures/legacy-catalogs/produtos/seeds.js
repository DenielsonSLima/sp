import {catalogSeeds} from './catalog-seeds.js';
export const productSeeds=[
 {id:'horti-tomate',name:'Tomate',asset:new URL('../../../assets/products/tomate.png',import.meta.url).href},
 {id:'horti-cebola',name:'Cebola',asset:new URL('../../../assets/products/cebola.png',import.meta.url).href},
 {id:'horti-batatinha',name:'Batatinha',asset:new URL('../../../assets/products/batatinha.png',import.meta.url).href},
 {id:'horti-melancia',name:'Melancia',asset:new URL('../../../assets/products/melancia.png',import.meta.url).href}
];
export const catalogMigration={
 id:'catalogo-marcas-acougue-2026-10-v1',
 keep:product=>['hortifruti','verduras','legumes','frutas'].includes(String(product.category||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()),
 seeds:catalogSeeds
};
