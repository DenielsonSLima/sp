import test from 'node:test';import assert from 'node:assert/strict';
import {partnerFromRegistry,fetchPartnerCnpj} from '../shared/data/partner-lookup.js';import {createDataApi} from '../shared/data/api.js';
const cnpj='00000000000191',record={cnpj,razao_social:'EMPRESA SA',nome_fantasia:'EMPRESA',logradouro:'CENTRAL',descricao_tipo_de_logradouro:'RUA',numero:'12',complemento:'Sala 2',bairro:'CENTRO',municipio:'ARACAJU',uf:'SE',cep:'49000-001',ddd_telefone1:'7933333333',email:'contato@example.com',qsa:[{nome_socio:'Not requested'}]};
test('public registry mapping keeps only requested identity, contact and address fields',()=>{
 const row=partnerFromRegistry(record,'BrasilAPI',cnpj);assert.equal(row.name,'EMPRESA');assert.equal(row.legalName,'EMPRESA SA');assert.equal(row.street,'RUA CENTRAL');assert.equal(row.postalCode,'49000001');assert.equal(row.number,'12');assert.equal(row.city,'ARACAJU');assert.equal(row.state,'SE');assert.ok(!('qsa' in row));
 assert.equal(partnerFromRegistry({...record,nome_fantasia:null},'BrasilAPI',cnpj).name,'EMPRESA SA');assert.throws(()=>partnerFromRegistry({...record,cnpj:'11111111111111'},'BrasilAPI',cnpj),/incompatíveis/);
});
test('a failed primary provider falls back to the free registry without forwarding application credentials',async()=>{
 const calls=[];const result=await fetchPartnerCnpj(cnpj,{fetcher:async(url,options)=>{calls.push({url,options});return calls.length===1?{ok:false,status:503}:{ok:true,status:200,json:async()=>({razao_social:'EMPRESA SA',estabelecimento:{cnpj,nome_fantasia:'EMPRESA',tipo_logradouro:'RUA',logradouro:'CENTRAL',numero:'12',bairro:'CENTRO',cidade:{nome:'ARACAJU'},estado:{sigla:'SE'},cep:'49000001',ddd1:'79',telefone1:'33333333'}})};}});
 assert.equal(result.provider,'CNPJ.ws');assert.equal(result.record.phone,'7933333333');assert.equal(result.record.city,'ARACAJU');assert.equal(calls.length,2);assert(calls.every(call=>call.options.credentials==='omit'&&!('Authorization' in call.options.headers)));
});
test('rate limit and cancellation leave errors explicit rather than inventing company data',async()=>{
 await assert.rejects(()=>fetchPartnerCnpj(cnpj,{fetcher:async()=>({ok:false,status:429})}),/limite/);
 const abort=new AbortController();abort.abort();await assert.rejects(()=>fetchPartnerCnpj(cnpj,{signal:abort.signal,fetcher:()=>{throw Error('must not call');}}),/cancelada/);
});
test('CNPJ lookup validates through the authorized RPC before fetching and caches by company',async()=>{
 const calls=[];let external=0;const client={rpc:async(name,args)=>{calls.push({name,args});return{data:cnpj,error:null};},channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:async()=>{}};
 const api=createDataApi({client,cnpjLookup:async canonical=>{external++;assert.equal(canonical,cnpj);return{record:partnerFromRegistry(record,'BrasilAPI',cnpj),provider:'BrasilAPI'};}});
 const context=id=>({companyId:id,user:{id:'owner'},company:{id,role:'owner'}});
 await api.setContext(context('a'));const first=await api.lookupPartnerCnpj('00.000.000/0001-91');first.record.name='Local change';assert.equal((await api.lookupPartnerCnpj(cnpj)).record.name,'EMPRESA');assert.equal(external,1);assert.equal(calls[0].name,'sp_partner_cnpj');assert.equal(calls[0].args.p_company_id,'a');
 await api.setContext(context('b'));await api.lookupPartnerCnpj(cnpj);assert.equal(external,2);assert.equal(calls.at(-1).args.p_company_id,'b');await api.setContext(null);
});
