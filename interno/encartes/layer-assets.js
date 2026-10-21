export const layerAssets=[
 {id:'fundo-vermelho-dourado',label:'Vermelho e dourado',kind:'background',width:1122,height:1402},
 {id:'fundo-laranja',label:'Laranja com movimento',kind:'background',width:1122,height:1402},
 {id:'fundo-azul',label:'Azul royal',kind:'background',width:1122,height:1402},
 {id:'raio-dourado',label:'Raio dourado 3D',kind:'sticker',width:1254,height:1254},
 {id:'balao-coracao',label:'Balão com coração 3D',kind:'sticker',width:1254,height:1254},
 {id:'selo-vermelho-dourado',label:'Selo vermelho e dourado',kind:'sticker',width:1254,height:1254}
].map(asset=>({...asset,src:`./assets/encartes/camadas/${asset.id}.png`}));
