// Real IndexedDB regression. Run only in an environment where browser execution is permitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
test('v1 PNGs survive migration, dynamic categories, reclassification and editor insertion',async()=>{
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/seed'){res.setHeader('Content-Type','text/html');res.end('<main></main>');return;}
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/shared/components/custom-select/styles.css"><main id="app"></main><script type="module">import {installCustomSelects} from "/shared/components/custom-select/index.js";import {render} from "/interno/cadastros/biblioteca-marca/index.js";installCustomSelects(document.querySelector("main"));render(document.querySelector("main"));</script>');return;}
  res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(new URL('..'+req.url,import.meta.url)));
 }catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const origin=`http://127.0.0.1:${server.address().port}`;
  await page.goto(origin+'/seed');
  await page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('supermercado-do-povo-biblioteca-marca',1);req.onupgradeneeded=()=>req.result.createObjectStore('assets',{keyPath:'id'});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('assets','readwrite');tx.objectStore('assets').add({id:'legacy',name:'Legado',category:'Logos',dataURL:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmxkAAAAASUVORK5CYII=',width:1,height:1});tx.oncomplete=()=>{db.close();resolve();};};}));
  await page.goto(origin);await page.getByRole('heading',{name:'Legado',exact:true}).waitFor();
  await page.locator('.brand-categories summary').click();await page.locator('.brand-add-category input').fill('Campanha <verão>');await page.locator('.brand-add-category button').click();await page.waitForFunction(()=>document.querySelector('.brand-category-status').textContent==='Categoria criada.');
  // Asset assignment through the system-wide custom select.
  await page.getByRole('button',{name:'Editar Legado',exact:true}).click();await page.locator('.brand-dialog .custom-select-trigger').click();await page.getByRole('option',{name:'Campanha <verão>',exact:true}).click();await page.locator('.brand-dialog [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.brand-card-body p').textContent.includes('Campanha <verão>'));
  await page.evaluate(async()=>{const store=await import('/interno/cadastros/biblioteca-marca/storage.js');window.snapshot=structuredClone((await store.listAssets())[0]);});
  await page.getByRole('button',{name:'Renomear categoria Campanha <verão>',exact:true}).click();await page.locator('.brand-category-dialog input').fill('Cabeçalhos especiais');await page.locator('.brand-category-dialog [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.brand-card-body p').textContent.includes('Cabeçalhos especiais'));
  await page.getByRole('button',{name:'Remover categoria Cabeçalhos especiais',exact:true}).click();await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();assert.equal(await page.locator('.brand-card').count(),1);
  await page.getByRole('button',{name:'Remover categoria Cabeçalhos especiais',exact:true}).click();await page.getByRole('button',{name:'Remover e mover elementos',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.brand-card-body p').textContent.includes('Sem categoria'));
  const values=await page.evaluate(async()=>{const store=await import('/interno/cadastros/biblioteca-marca/storage.js');let rejected=false;try{await store.addAsset({...window.snapshot,id:'bad-category',category:'Missing'});}catch{rejected=true;}return {assets:await store.listAssets(),names:await store.listCategories(),snapshot:window.snapshot,rejected};});assert.equal(values.assets.length,1);assert.equal(values.assets[0].dataURL,values.snapshot.dataURL);assert.equal(values.snapshot.category,'Campanha <verão>');assert.ok(values.rejected);assert.ok(!values.names.includes('Cabeçalhos especiais'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('.brand-card-body p')?.textContent.includes('Sem categoria'));
  // An edit open in another tab must not resurrect an asset deleted meanwhile.
  await page.getByRole('button',{name:'Editar Legado',exact:true}).click();await page.locator('.brand-dialog input').fill('Tentativa preservada');
  await page.evaluate(async()=>{const store=await import('/interno/cadastros/biblioteca-marca/storage.js');window.deletedAsset=(await store.listAssets())[0];await store.deleteAsset('legacy');});
  await page.locator('.brand-dialog [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.brand-edit-status').textContent.includes('excluído em outra aba'));
  assert.equal(await page.locator('.brand-dialog').evaluate(d=>d.open),true);assert.equal(await page.locator('.brand-dialog input').inputValue(),'Tentativa preservada');assert.equal(await page.evaluate(async()=>{const store=await import('/interno/cadastros/biblioteca-marca/storage.js');return (await store.listAssets()).length;}),0);
  await page.locator('.brand-cancel').click();await page.evaluate(async()=>{const store=await import('/interno/cadastros/biblioteca-marca/storage.js');await store.addAsset(window.deletedAsset);});await page.reload();await page.getByRole('heading',{name:'Legado',exact:true}).waitFor();

  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Editor uses the same persisted categories and inserts a detached snapshot.
  await page.evaluate(async()=>{const store=await import('/interno/cadastros/biblioteca-marca/storage.js');await store.addCategory('Só no editor');const root=document.querySelector('main');const {renderBrandPanel}=await import('/interno/encartes/brand-panel.js');await renderBrandPanel(root,{onInsert:value=>{window.inserted=value;}});});await page.waitForFunction(()=>[...document.querySelectorAll('.brand-category option')].some(o=>o.value==='Só no editor'));await page.getByRole('button',{name:'Legado',exact:true}).click();assert.equal(await page.evaluate(()=>window.inserted.category),'Sem categoria');assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
