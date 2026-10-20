import {heading} from './common.js';
import {renderList} from './list.js';
import {renderDetail} from './detail.js';
export async function render(root){root.innerHTML=`<link rel="stylesheet" href="./interno/hortifruti/styles.css"><section class="hortifruti">${heading('ROTINA DA FEIRA','Hortifruti','Organize a compra, confira a pesagem e registre a entrada dos produtos.')}<div class="hf-content"></div></section>`;const content=root.querySelector('.hf-content'),key=location.hash.split('/')[1];if(key)return renderDetail(content,key);renderList(content);}
