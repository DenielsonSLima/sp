// Credentials arrive only on stdin; no credentials or tokens are logged or persisted.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {supabaseConfig} from '../shared/data/config.js';
import {resources} from '../shared/data/api.js';
const credentials=JSON.parse(await readFile('/dev/stdin','utf8'));
const make=()=>createClient(supabaseConfig.url,supabaseConfig.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
const writer=make(),observer=make(),anonymous=make();let channel;
try{
 for(const client of [writer,observer]){const {error}=await client.auth.signInWithPassword(credentials);if(error)throw Error(error.message);}
 console.log('Sessões Auth verificadas.');
 const {data:context,error:contextError}=await writer.rpc('sp_context');if(contextError)throw contextError;
 const company=context.companyId;assert.ok(company);
 const lists=await Promise.all(resources.map(async resource=>{const {data,error}=await writer.rpc('sp_list',{p_company_id:company,p_resource:resource});if(error)throw Error(`${resource}: ${error.message}`);assert.ok(Array.isArray(data));return {resource,data};}));
 console.log('Recursos RPC verificados.');
 const unit=lists.find(v=>v.resource==='units').data.find(v=>v.id==='UN');assert.ok(unit);
 const {error:anonymousError}=await anonymous.rpc('sp_context');assert.ok(anonymousError,'RPC anônima deve ser bloqueada');
 let signalResolve,signalReject;
 const received=new Promise((resolve,reject)=>{signalResolve=resolve;signalReject=reject;});
 const timer=setTimeout(()=>signalReject(Error('Realtime não entregou sinal de alteração em 15 segundos.')),15000);
 const connected=new Promise((resolve,reject)=>{
  channel=observer.channel('verification:'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'resource_changes',filter:`company_id=eq.${company}`},payload=>{if(payload.new?.resource==='units')signalResolve(payload);}).subscribe(status=>{if(status==='SUBSCRIBED')resolve();if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')reject(Error('Falha na assinatura Realtime.'));});
 });
 try{
  await connected;
  // Save the existing unit without changing its business fields; verifies Auth -> RPC -> SQL -> Realtime.
  const {data:saved,error}=await writer.rpc('sp_save',{p_company_id:company,p_resource:'units',p_record:unit,p_expected_version:unit._version});if(error)throw error;
  assert.equal(saved.name,unit.name);assert.equal(saved.symbol,unit.symbol);assert.equal(saved._version,unit._version+1);
  await received;
 }finally{clearTimeout(timer);}
 const {data:serverUnit,error:readError}=await observer.rpc('sp_get',{p_company_id:company,p_resource:'units',p_id:'UN'});if(readError)throw readError;assert.equal(serverUnit._version,unit._version+1);
 console.log(JSON.stringify({verified:true,resources:resources.length,authenticated:true,anonymousBlocked:true,realtimeDelivered:true,persistenceReadback:true,unitBusinessFieldsUnchanged:true}));
}finally{
 if(channel)await observer.removeChannel(channel);
 for(const client of [writer,observer])await client.auth.signOut({scope:'local'});
 for(const client of [writer,observer,anonymous]){await client.removeAllChannels();client.realtime.disconnect();}
}
