import test from 'node:test';
import assert from 'node:assert/strict';
import {dailySummary,createNoticeStore,NOTICE_KEY} from './fixtures/legacy-operations/home-state.js';

test('daily summary includes only open work and active promotions ending in the next seven days',()=>{
 const summary=dailySummary({today:'2026-12-28',quotes:[{status:'open'},{status:'finished'}],purchases:[{status:'pending',entryConfirmed:false},{status:'pending',entryConfirmed:true},{status:'finished'}],campaigns:[{start:'2026-12-01',end:'2026-12-28'},{start:'2026-12-01',end:'2027-01-04'},{start:'2026-12-29',end:'2027-01-01'},{start:'2026-12-01',end:'2026-12-27'},{start:'2026-12-01',end:'2027-01-05'}],printRecords:[{status:'draft'},{status:'sent'},{status:'sent',archivedAt:'2026-12-28'},{status:'finalized'}]});
 assert.deepEqual(summary,{quotes:1,purchases:1,campaigns:2,printing:1});
 assert.deepEqual(dailySummary(),{quotes:0,purchases:0,campaigns:0,printing:0});
});
const memoryStorage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
test('notice persists text and detects changes in another tab',()=>{
 const storage=memoryStorage(),a=createNoticeStore(storage),b=createNoticeStore(storage);
 assert.equal(a.read(),'');assert.equal(b.read(),'');
 assert.equal(a.save('  Conferir a feira até as 10h.  '),'Conferir a feira até as 10h.');
 assert.throws(()=>b.save('Sobrescrever'),/outra aba/);
 assert.equal(b.read(),'Conferir a feira até as 10h.');
 assert.equal(b.save(''),'');assert.equal(createNoticeStore(storage).read(),'');
});
test('invalid or unavailable storage and quota errors never report a successful notice save',()=>{
 const storage=memoryStorage();storage.setItem(NOTICE_KEY,'inválido');
 const corrupt=createNoticeStore(storage);assert.throws(()=>corrupt.read(),/ler o aviso/);assert.throws(()=>corrupt.save('Novo'),/Recarregue/);assert.equal(storage.getItem(NOTICE_KEY),'inválido');
 assert.throws(()=>createNoticeStore(null).read(),/não permite/);
 const quota=createNoticeStore({getItem:()=>null,setItem(){throw Error('Quota');}});quota.read();assert.throws(()=>quota.save('Novo'),/Não foi possível salvar/);
 const normal=createNoticeStore(memoryStorage());normal.read();assert.throws(()=>normal.save('x'.repeat(241)),/240/);
});
