export const modules={
 inicio:{label:'Início',load:()=>import('./inicio/index.js')},
 cadastros:{label:'Cadastros',load:()=>import('./cadastros/index.js')},
 cotacao:{label:'Cotação',load:()=>import('./cotacao/index.js')},
 hortifruti:{label:'Hortifruti',load:()=>import('./hortifruti/index.js')},
 encartes:{label:'Encartes',isNew:true,load:()=>import('./encartes/index.js')},
 promocoes:{label:'Promoções',isNew:true,load:()=>import('./promocoes/index.js')},
 configuracoes:{label:'Configurações',load:()=>import('./configuracoes/index.js')}
};
export const resolveRoute=(hash)=>Object.hasOwn(modules,hash.slice(1))?hash.slice(1):'inicio';
