import {parseBRLCents} from '../../shared/components/currency-input/index.js';
import {normalizeTemplate} from '../cadastros/modelos-cartaz/model.js';
export const STORAGE_KEY='supermercado-price-table-v1';
export const RETENTION_MS=90*24*60*60*1000;
const clone=value=>structuredClone(value);
const validDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T12:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;};
export function validateEntry(entry){
 if(!entry.productSnapshot?.id||!entry.name)throw Error('Selecione um produto do catálogo.');
 const cents=parseBRLCents(entry.priceRaw);if(!Number.isSafeInteger(cents)||cents<1)throw Error('Informe um preço de venda maior que zero.');
 const start=entry.start||'',end=entry.end||'';
 if((start||end)&&(!validDate(start)||!validDate(end)||start>end))throw Error('Preencha as duas datas com um período válido, ou deixe ambas vazias.');
 if(!entry.templateSnapshot)throw Error('Selecione um modelo de impressão.');
 const templateSnapshot=normalizeTemplate(entry.templateSnapshot);
 if(!/^\d+$/.test(String(entry.quantity))||Number(entry.quantity)<1||Number(entry.quantity)>200)throw Error('Use uma quantidade inteira entre 1 e 200.');
 if(!['individual','two-a4'].includes(entry.printLayout))throw Error('Selecione um formato de impressão válido.');
 if(entry.printLayout==='two-a4'&&(templateSnapshot.widthMm>148.5||templateSnapshot.heightMm>210))throw Error('O modelo não cabe em 2 por A4. Escolha folha individual ou um modelo de até 148,5 × 210 mm.');
 return {...clone(entry),cents,start,end,templateSnapshot,quantity:Number(entry.quantity)};
}
export function createPriceTableStore({storage,now=()=>new Date().toISOString(),id=()=>globalThis.crypto.randomUUID()}={}){
 let records=[],loaded=false,base=null;
 const target=()=>{if(storage!==undefined)return storage;try{return globalThis.localStorage;}catch{throw Error('O armazenamento deste navegador está bloqueado.');}};
 function load(){if(loaded)return;const saved=target()?.getItem(STORAGE_KEY)??null;
 if(saved!==null){let data;try{data=JSON.parse(saved);if(data.version!==1||!Array.isArray(data.records)||new Set(data.records.map(r=>r.id)).size!==data.records.length||data.records.some(r=>!r||typeof r.id!=='string'||!['draft','sent','finalized'].includes(r.status)||!Number.isFinite(Date.parse(r.createdAt))||(r.status==='finalized'&&!Number.isFinite(Date.parse(r.finalizedAt)))))throw Error();}catch{throw Error('Não foi possível ler a tabela salva. Os dados originais foram preservados; não será gravada uma nova cópia sobre eles.');}records=data.records;}
 base=saved;loaded=true;}
 function commit(next){const destination=target();if(!destination&&typeof window!=='undefined')throw Error('Armazenamento local indisponível.');if(destination&&(destination.getItem(STORAGE_KEY)??null)!==base)throw Error('A tabela foi alterada em outra aba. Recarregue antes de salvar; seus campos continuam nesta tela.');const serialized=JSON.stringify({version:1,records:next});try{destination?.setItem(STORAGE_KEY,serialized);}catch{throw Error('Não foi possível salvar. Seus campos foram mantidos. Verifique o espaço e a permissão do navegador.');}records=next;base=serialized;}
 function modify(fn){load();const next=clone(records),result=fn(next);commit(next);return clone(result);}
 const find=(rows,key)=>{const entry=rows.find(r=>r.id===key);if(!entry)throw Error('Item não encontrado.');return entry;};
 const requireStatus=(entry,status)=>{if(entry.status!==status||entry.archivedAt)throw Error('Esta ação não está disponível nesta etapa.');};
 return {
 list(){load();return clone(records);},get(key){load();return clone(find(records,key));},
 saveDraft(key,input,products,templates){return modify(rows=>{let entry=key?find(rows,key):null;if(entry)requireStatus(entry,'draft');const stamp=now();entry=entry||{id:id(),status:'draft',createdAt:stamp,finalizedAt:null,archivedAt:null};
 const productId=String(input.productId??''),templateId=String(input.templateId??'');
 let productSnapshot=entry.productSnapshot,templateSnapshot=entry.templateSnapshot;
 if(productId!==entry.productId){const p=products.find(p=>p.id===productId);productSnapshot=p?{id:p.id,name:p.name,unit:p.unit,unitLabel:p.unitLabel||p.unit,code:p.code||''}:null;}
 if(templateId!==entry.templateId){const t=templates.find(t=>t.id===templateId);templateSnapshot=t?normalizeTemplate(t):null;}
 Object.assign(entry,{productId,templateId,productSnapshot,templateSnapshot,name:productSnapshot?.name||'',unit:[productSnapshot?.unit,productSnapshot?.unitLabel].some(v=>String(v||'').toUpperCase()==='KG')?'kg':'unid',priceRaw:String(input.priceRaw??''),start:String(input.start??''),end:String(input.end??''),quantity:String(input.quantity??'1'),printLayout:String(input.printLayout||'individual'),updatedAt:stamp});
 try{entry.cents=parseBRLCents(entry.priceRaw);}catch{entry.cents=null;}
 if(!key)rows.push(entry);return entry;});},
 send(keys){return modify(rows=>{if(!keys.length)throw Error('Selecione pelo menos um rascunho.');const stamp=now();const clean=keys.map(key=>{const e=find(rows,key);requireStatus(e,'draft');return validateEntry(e);});for(const e of clean)Object.assign(find(rows,e.id),e,{status:'sent',sentAt:stamp,updatedAt:stamp});return clean;});},
 finalize(keys){return modify(rows=>{if(!keys.length)throw Error('Selecione os itens impressos.');const stamp=now();const selected=keys.map(key=>find(rows,key));selected.forEach(e=>requireStatus(e,'sent'));selected.forEach(e=>Object.assign(e,{status:'finalized',finalizedAt:stamp,updatedAt:stamp}));return selected;});},
 reopen(key){return modify(rows=>{const entry=find(rows,key);if(entry.archivedAt)throw Error('Restaure este item primeiro.');if(entry.status!=='sent')throw Error('Somente itens enviados podem voltar ao rascunho.');Object.assign(entry,{status:'draft',finalizedAt:null,sentAt:null,updatedAt:now()});return entry;});},
 archiveExpired(){load();const stamp=now(),next=clone(records);let count=0;for(const e of next)if(e.status==='finalized'&&!e.archivedAt&&!e.restoredAt&&Date.parse(stamp)-Date.parse(e.finalizedAt)>=RETENTION_MS){e.archivedAt=stamp;count++;}if(count)commit(next);return count;},
 restore(key){return modify(rows=>{const entry=find(rows,key);if(!entry.archivedAt)throw Error('Este item não está arquivado.');entry.archivedAt=null;entry.restoredAt=now();entry.updatedAt=now();return entry;});}
 };
}
export const priceTableStore=createPriceTableStore();
