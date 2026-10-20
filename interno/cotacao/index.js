import './tabs.js';
import {renderList} from './list.js';import {renderWizard} from './wizard.js';import {renderDetail} from './detail.js';
export async function render(root){const key=location.hash.split('/')[1];if(key==='nova')return renderWizard(root);if(key)return renderDetail(root,key);return renderList(root);}
