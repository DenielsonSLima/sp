export const modules={
 inicio:{label:'Início',load:()=>import('./inicio/index.js')},
 cadastros:{label:'Cadastros',children:{parceiros:{label:'Parceiros',load:()=>import('./cadastros/parceiros/index.js')},produtos:{label:'Produtos',load:()=>import('./cadastros/produtos/index.js')},unidades:{label:'Unidades de medida',load:()=>import('./cadastros/unidades/index.js')},acougue:{label:'Açougue',load:()=>import('./cadastros/acougue/index.js')},'modelos-cartaz':{label:'Modelos de cartaz',load:()=>import('./cadastros/modelos-cartaz/index.js')},'biblioteca-marca':{label:'Biblioteca',load:()=>import('./cadastros/biblioteca-marca/index.js')}},load:()=>import('./cadastros/produtos/index.js')},
 devolucoes:{label:'Devoluções',isNew:true,load:()=>import('./devolucoes-fornecedores/index.js')},
 cotacao:{label:'Cotação',load:()=>import('./cotacao/index.js')},
 hortifruti:{label:'Hortifruti',load:()=>import('./hortifruti/index.js')},
 acougue:{label:'Açougue',isNew:true,load:()=>import('./acougue/index.js')},
 encartes:{label:'Encartes',isNew:true,load:()=>import('./encartes/index.js')},
 promocoes:{label:'Promoções',isNew:true,load:()=>import('./promocoes/index.js')},
 calendario:{label:'Calendário',load:()=>import('./calendario/index.js')},
 configuracoes:{label:'Configurações',load:()=>import('./configuracoes/index.js')}
};
export const resolveRoute=(hash)=>{const route=hash.slice(1).split('/')[0];return Object.hasOwn(modules,route)?route:'inicio';};

export const resolveCadastro=(hash)=>Object.hasOwn(modules.cadastros.children,hash.split('/')[1])?hash.split('/')[1]:'produtos';
