import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)('playwright');

const boot = `<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/shared/base.css"><link rel="stylesheet" href="/shared/components/custom-select/styles.css"><main id="app" style="padding:20px"></main><script type="module">import {render as renderCalendar} from '/interno/calendario/index.js';import {render as renderPromotions} from '/interno/promocoes/index.js';import {campaignStore} from '/interno/promocoes/state.js';import {calendarStore} from '/interno/calendario/state.js';import {installCustomSelects} from '/shared/components/custom-select/index.js';installCustomSelects(document.querySelector('#app'));window.campaignStore=campaignStore;window.calendarStore=calendarStore;window.draw=()=>location.hash.startsWith('#promocoes')?renderPromotions(document.querySelector('#app')):renderCalendar(document.querySelector('#app'));addEventListener('hashchange',window.draw);window.draw();</script>`;

test('calendar desktop/mobile CRUD, keyboard, filters, campaign links, live dates, cancel and persistence', async () => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/') {res.setHeader('Content-Type', 'text/html'); res.end(boot);}
      else {res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(new URL('..' + path, import.meta.url)));}
    } catch {res.statusCode = 404; res.end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
    const page = await browser.newPage({viewport: {width: 1500, height: 1000}, timezoneId: 'America/Sao_Paulo'});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/#calendario`);
    await page.locator('.calendar-month-grid').waitFor();
    const month = value => page.locator('[name=calendar-month]').fill(value);
    const choose = async (name, label) => {await page.getByRole('combobox', {name, exact: true}).click(); await page.getByRole('option', {name: label, exact: true}).click();};
    await month('2026-10'); await page.locator('[data-day="2026-10-20"]').click();
    const campaignId = await page.evaluate(() => window.campaignStore.create({name: 'Campanha da virada', start: '2026-10-30', end: '2026-11-02', notes: 'Ofertas especiais'}).id);
    await page.waitForFunction(() => document.querySelector('.calendar-count').textContent.includes('1 promoção'));
    assert.match(await page.locator('[data-day="2026-10-30"]').getAttribute('aria-label'), /1 registro/);
    await page.getByRole('button', {name: 'Novo registro', exact: true}).click();
    await page.locator('dialog [name=title]').fill('Reunião da equipe'); await page.locator('dialog [name=date]').fill('2026-10-20'); await page.locator('dialog [name=time]').fill('08:30');
    await choose('Cor', 'Verde'); await page.locator('dialog [name=notes]').fill('Alinhar ofertas e cartazes');
    await page.getByRole('button', {name: 'Salvar registro', exact: true}).click();
    assert.equal(await page.locator('dialog').count(), 0); assert.equal(await page.locator('.calendar-day-details .calendar-entry').count(), 1);
    assert.match(await page.locator('.calendar-day-details').innerText(), /08:30/); assert(await page.locator('.calendar-day-details .calendar-color-green').isVisible());
    await page.getByRole('button', {name: 'Novo registro', exact: true}).click();
    await page.locator('dialog [name=title]').fill('<img src=x onerror=alert(1)>'); await page.locator('dialog [name=date]').fill('2026-10-20'); await choose('Tipo', 'Anotação'); await choose('Cor', 'Roxo');
    await page.getByRole('button', {name: 'Salvar registro', exact: true}).click(); assert.equal(await page.locator('.calendar-module img').count(), 0); assert.equal(await page.locator('.calendar-day-details .calendar-entry').count(), 2);
    // Cancel and Escape must keep the existing saved record, restore focus and close only the form.
    await page.getByRole('button', {name: 'Editar Reunião da equipe', exact: true}).click(); await page.locator('dialog [name=title]').fill('Não salvar'); await page.getByRole('button', {name: 'Cancelar', exact: true}).click(); await page.getByRole('button', {name: 'Continuar editando', exact: true}).click(); assert.equal(await page.locator('dialog [name=title]').inputValue(), 'Não salvar'); await page.getByRole('button', {name: 'Fechar formulário', exact: true}).click(); await page.getByRole('button', {name: 'Descartar', exact: true}).click();
    assert.equal(await page.getByRole('button', {name: 'Editar Reunião da equipe', exact: true}).evaluate(node => node === document.activeElement), true);
    await page.getByRole('button', {name: 'Editar Reunião da equipe', exact: true}).click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog').count(), 0);
    await page.getByRole('button', {name: 'Editar Reunião da equipe', exact: true}).click(); await page.locator('dialog [name=title]').fill('   '); await page.locator('dialog [name=date]').fill(''); await page.keyboard.press('Escape'); await page.getByRole('button', {name: 'Continuar editando', exact: true}).click(); assert.equal(await page.locator('dialog [name=title]').inputValue(), '   '); assert.equal(await page.locator('dialog [name=date]').inputValue(), ''); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog').count(), 1); await page.getByRole('button', {name: 'Cancelar', exact: true}).click(); await page.getByRole('button', {name: 'Descartar', exact: true}).click();
    await page.getByRole('button', {name: 'Editar Reunião da equipe', exact: true}).click(); await page.locator('dialog [name=title]').fill('Reunião revisada'); await page.locator('dialog [name=date]').fill('2026-11-01'); await page.locator('dialog [name=time]').fill(''); await page.getByRole('button', {name: 'Salvar registro', exact: true}).click();
    assert.equal(await page.locator('[name=calendar-month]').inputValue(), '2026-11'); assert.match(await page.locator('.calendar-day-details').innerText(), /Dia inteiro/); assert.equal(await page.locator('.calendar-day-details .calendar-entry').count(), 2);
    await page.getByRole('button', {name: 'Excluir Reunião revisada', exact: true}).click(); await page.getByRole('button', {name: 'Cancelar', exact: true}).click(); assert(await page.getByRole('button', {name: 'Editar Reunião revisada', exact: true}).isVisible());
    await page.getByRole('button', {name: 'Excluir Reunião revisada', exact: true}).click(); await page.getByRole('button', {name: 'Excluir registro', exact: true}).click(); assert.equal(await page.getByRole('button', {name: 'Editar Reunião revisada', exact: true}).count(), 0);
    await page.reload(); await month('2026-10'); await page.locator('[data-day="2026-10-20"]').click(); assert.equal(await page.locator('.calendar-day-details .calendar-entry').count(), 1); assert.match(await page.locator('.calendar-day-details').innerText(), /<img/);
    await choose('Tipo de registro', 'Promoção'); assert.equal(await page.locator('.calendar-day-details .calendar-entry').count(), 0); await page.locator('[name=calendar-query]').fill('virada'); assert.match(await page.locator('.calendar-count').innerText(), /1 registro/);
    await page.locator('[name=calendar-query]').fill('não existe'); assert.match(await page.locator('.calendar-count').innerText(), /0 registro/); await page.getByRole('button', {name: 'Limpar filtros', exact: true}).click();
    // Grid has one tab stop, directional navigation crosses month boundary without UTC conversion.
    assert.equal(await page.locator('[data-day][tabindex="0"]').count(), 1); await page.locator('[data-day="2026-10-31"]').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('[name=calendar-month]').inputValue(), '2026-11'); assert.equal(await page.locator('[data-day="2026-11-01"]').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Home'); assert.equal(await page.locator('[data-day="2026-10-26"]').evaluate(node => node === document.activeElement), true);
    await month('2026-11'); await page.locator('[data-day="2026-11-02"]').click(); assert.match(await page.locator('.calendar-day-details').innerText(), /Campanha da virada/);
    await page.evaluate(id => window.campaignStore.update(id, {name: 'Campanha revisada', start: '2026-11-03', end: '2026-11-04', notes: 'Nova data'}), campaignId);
    assert.equal(await page.locator('.calendar-day-details .calendar-entry').count(), 0); await page.locator('[data-day="2026-11-03"]').click();
    const open = page.getByRole('link', {name: 'Abrir campanha →', exact: true}); assert.equal(await open.getAttribute('href'), `#promocoes/${campaignId}`); await open.click(); await page.locator('.campaign-title').waitFor(); assert.equal(await page.locator('.campaign-title').textContent(), 'Campanha revisada');
    await page.goBack(); await page.locator('.calendar-module').waitFor(); assert.equal(await page.locator('dialog').count(), 0); assert.equal(await page.locator('.custom-select-popup').count(), 1);
    await page.getByRole('button', {name: 'Agenda', exact: true}).click(); await page.setViewportSize({width: 390, height: 844}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.calendar-agenda-day').count(), 2); await page.getByRole('button', {name: 'Novo registro', exact: true}).click(); await choose('Tipo', 'Anotação'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.getByRole('button', {name: 'Cancelar', exact: true}).click(); await page.getByRole('button', {name: 'Descartar', exact: true}).click();
    await page.getByRole('button', {name: 'Mês', exact: true}).click(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({width: 320, height: 750}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // A fresh mobile entry uses Agenda by default and contains no horizontal overflow.
    const mobile = await browser.newPage({viewport: {width: 390, height: 844}}); await mobile.goto(`http://127.0.0.1:${server.address().port}/#calendario`); await mobile.locator('.calendar-agenda').waitFor(); assert.equal(await mobile.getByRole('button', {name: 'Agenda', exact: true}).getAttribute('aria-pressed'), 'true'); await mobile.close();
    assert.deepEqual(errors, []);
  } finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
});
