import {createDesign,createHistory,validateDesign} from './model.js';
const initial=createDesign();initial.bgColor='#ffffff';
export const editorState={design:initial,history:createHistory(initial),selection:null,tab:'models',tool:'products',zoom:'fit',saveMessage:'Nova arte',query:'',category:'',selectedProducts:new Set(),templateQuery:'',templateScroll:0,cleanup:null};
export function openDesign(design){editorState.design=validateDesign(design);editorState.history=createHistory(editorState.design);editorState.selection=null;editorState.tab='create';editorState.saveMessage='Salvo neste dispositivo';}
export function commitDesign(design){const next=validateDesign({...design,status:'draft',updatedAt:new Date().toISOString()});editorState.design=editorState.history.commit(next);return editorState.design;}
