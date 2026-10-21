import {heading,base} from './common.js';
import {renderList} from './list.js';
import {renderDetail} from './detail.js';
export async function render(root){const key=location.hash.split('/')[1],title=heading('ROTINA DA FEIRA','Hortifruti','Organize a compra, confira a pesagem e registre a entrada dos produtos.');root.innerHTML=`<link rel="stylesheet" href="./interno/hortifruti/styles.css"><section class="hortifruti">${key?title:`<div class="page-heading-actions">${title}<a class="button primary" href="${base}/nova">+ Nova compra</a></div>`}<div class="hf-content"></div></section>`;const content=root.querySelector('.hf-content');if(key)return renderDetail(content,key);renderList(content);}
