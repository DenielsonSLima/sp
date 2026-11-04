import {readDomainSource} from './helpers/domain-source.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {createDemoRepository} from './fixtures/demo-repository.js';import {escapeHtml} from '../shared/ui.js';
test('isolated fictitious data and immutable reads',async()=>{const repo=createDemoRepository();const rows=await repo.listProducts();assert.equal(rows.length,3);rows[0].name='changed';assert.notEqual((await repo.listProducts())[0].name,'changed');assert.equal((await createDemoRepository().summary()).products,3);});
test('create and validate local example',async()=>{const repo=createDemoRepository();await assert.rejects(()=>repo.createProduct({name:'   '}));const row=await repo.createProduct({name:' Teste ',unit:'KG'});assert.equal(row.name,'Teste');assert.equal(row.unit,'KG');assert.equal((await repo.summary()).products,4);});
test('HTML escaped before rendering user input',()=>{assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');});
import {modules,resolveRoute,isModuleAllowed,navigationSections} from '../interno/modules.js';
import {readFlyerSection,flyerTabsMarkup} from '../interno/encartes/navigation.js';
test('all module routes load and have render functions',async()=>{assert.deepEqual(Object.keys(modules),['inicio','cadastros','devolucoes','cotacao','hortifruti','acougue','galeria','encartes','promocoes','tabela-precos','calendario','configuracoes']);for(const [route,module] of Object.entries(modules)){assert.equal(resolveRoute('#'+route),route);assert.equal(typeof(await module.load()).render,'function');}});
test('unknown and inherited-property routes fall back safely',()=>{for(const hash of ['','#unknown','#toString','#__proto__','#constructor'])assert.equal(resolveRoute(hash),'inicio');});
test('gallery inherits flyer permission and loses access when that permission is revoked',()=>{
  for(const route of ['galeria','encartes']){
    assert.equal(isModuleAllowed(route,['encartes']),true);
    assert.equal(isModuleAllowed(route,['inicio']),false);
    assert.equal(isModuleAllowed(route,[]),false);
    assert.equal(isModuleAllowed(route,['galeria']),false);
    assert.equal(isModuleAllowed(route,'encartes'),false);
  }
  assert.equal(isModuleAllowed('galeria'),true);
  assert.equal(isModuleAllowed('toString'),false);
  assert.equal(isModuleAllowed('__proto__',['__proto__']),false);
});
test('model and promotion links open the unified flyer module with the requested section',()=>{
  assert.equal(resolveRoute('#encartes?modelo=modelo_123&promocao=campaign-1'),'encartes');
  assert.equal(resolveRoute('#modelos?promocao=campaign-1'),'encartes');
  assert.equal(readFlyerSection('#modelos?promocao=campaign-1'),'ready');
  assert.equal(readFlyerSection('#encartes?aba=modelos&promocao=campaign-1'),'ready');
  assert.equal(readFlyerSection('#encartes?aba=meus-modelos'),'mine');
  assert.equal(readFlyerSection('#encartes?aba=salvos'),'saved');
  assert.equal(readFlyerSection('#encartes?modelo=modelo_123'),'create');
  assert.equal(readFlyerSection('#encartes?aba=unknown'),'create');
  assert.equal(navigationSections.flatMap(section => section.items).includes('modelos'),false);
  const tabs = flyerTabsMarkup('ready',{campaignId:'campaign-1'});
  assert.equal((tabs.match(/role="tab"/g) || []).length,4);
  assert.match(tabs,/data-flyer-href="#encartes\?promocao=campaign-1"/);
});
test('Promoções uses functional poster linkage and persistent module styles',async()=>{const source=await readDomainSource('interno/promocoes');const appCss=await readFile(new URL('../shared/app.css',import.meta.url),'utf8');assert.match(appCss,/@import\s+['"]\.\.\/interno\/promocoes\/styles\.css['"]/);assert.match(appCss,/@import\s+['"]\.\.\/interno\/cadastros\/modelos-cartaz\/styles\.css['"]/);assert.doesNotMatch(source,/<link\b[^>]*rel=["']stylesheet["']/);assert.match(source,/openCampaignPdfDialog/);assert.match(source,/planCampaignPdfs/);});
import {readFile,stat} from 'node:fs/promises';
test('immersive login photo is local, present, optimized and styled',async()=>{const css=await readFile(new URL('../login/login.css',import.meta.url),'utf8');assert.match(css,/url\('\.\.\/assets\/hortifruti-photo\.jpg'\)/);assert.match(css,/linear-gradient/);const photo=await stat(new URL('../assets/hortifruti-photo.jpg',import.meta.url));assert(photo.size>10000&&photo.size<600000);});
