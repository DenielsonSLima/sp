import {renderLogin} from '../login/login.js';
import {renderShell} from '../interno/shell.js';
const app=document.querySelector('#app');let demoSession=false;
const render=()=>{if(!demoSession)renderLogin(app,()=>{demoSession=true;location.hash='inicio';render();});else renderShell(app,()=>{demoSession=false;location.hash='';render();});};
window.addEventListener('hashchange',render);render();
