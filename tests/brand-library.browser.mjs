import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
test('brand library real IndexedDB upload, reload, rename, delete and PNG snapshot',async()=>{
 const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<main id="app"></main><script type="module">import {render} from "/interno/cadastros/biblioteca-marca/index.js";render(document.querySelector("main"));</script>');return;}res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(new URL('..'+req.url,import.meta.url)));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmxkAAAAASUVORK5CYII=','base64');
 await page.locator('input[type=file]').setInputFiles([{name:'Logo.png',mimeType:'image/png',buffer:png},{name:'Mascote.png',mimeType:'image/png',buffer:png}]);await page.getByRole('button',{name:'Salvar PNGs na biblioteca'}).click();await page.waitForFunction(()=>document.querySelectorAll('.brand-card').length===2);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.brand-card').length===2);
 await page.getByRole('button',{name:'Editar Logo',exact:true}).click();await page.locator('.brand-dialog input').fill('Logo principal');await page.locator('.brand-dialog select').selectOption('Logos');await page.locator('.brand-dialog button[type=submit]').click();await page.getByRole('heading',{name:'Logo principal',exact:true}).waitFor();
 await page.evaluate(async()=>{const {listAssets}=await import('/interno/cadastros/biblioteca-marca/storage.js');const {snapshotAsset}=await import('/interno/cadastros/biblioteca-marca/state.js');window.savedSnapshot=snapshotAsset((await listAssets()).find(a=>a.name==='Logo principal'));});
 await page.getByRole('button',{name:'Excluir Logo principal',exact:true}).click();await page.getByRole('button',{name:'Excluir da biblioteca',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.brand-card').length===1);assert.equal(await page.evaluate(()=>window.savedSnapshot.dataURL),'data:image/png;base64,'+png.toString('base64'));
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
