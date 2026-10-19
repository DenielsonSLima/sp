export const modules={
 inicio:{label:'Início',load:()=>import('./inicio/index.js')},
 cadastros:{label:'Cadastros',children:{parceiros:{label:'Parceiros',load:()=>import('./cadastros/parceiros/index.js')},produtos:{label:'Produtos',load:()=>import('./cadastros/produtos/index.js')}},load:()=>import('./cadastros/produtos/index.js')},
 cotacao:{label:'Cotação',load:()=>import('./cotacao/index.js')},
 hortifruti:{label:'Hortifruti',load:()=>import('./hortifruti/index.js')},
 acougue:{label:'Açougue',isNew:true,load:()=>import('./acougue/index.js')},
 encartes:{label:'Encartes',isNew:true,load:()=>import('./encartes/index.js')},
 promocoes:{label:'Promoções',isNew:true,load:()=>import('./promocoes/index.js')},
 configuracoes:{label:'Configurações',load:()=>import('./configuracoes/index.js')}
};
export const resolveRoute=(hash)=>{const route=hash.slice(1).split('/')[0];return Object.hasOwn(modules,route)?route:'inicio';};

export const resolveCadastro=(hash)=>Object.hasOwn(modules.cadastros.children,hash.split('/')[1])?hash.split('/')[1]:'produtos';
