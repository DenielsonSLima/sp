import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {nthWeekdayOfMonth, easterDate, blackFridayDate, commercialDates, suggestedPeriods, retailHolidays, retailAgendaGroups, commercialSources} from '../interno/calendario/commercial.js';
import {localDate, validDate, monthBounds, filterCalendarItems, createCalendarStore, calendarItems} from '../interno/calendario/state.js';

test('Black Friday follows the fourth Thursday, including the fifth Friday in 2024', () => {
  for (const [year, expected] of [[2023, '2023-11-24'], [2024, '2024-11-29'], [2026, '2026-11-27'], [2027, '2027-11-26'], [2028, '2028-11-24']]) {
    assert.equal(blackFridayDate(year), expected); assert.equal(localDate(blackFridayDate(year)).getDay(), 5);
  }
  assert.equal(nthWeekdayOfMonth(2024, 11, 5, 4), '2024-11-22'); assert.notEqual(blackFridayDate(2024), nthWeekdayOfMonth(2024, 11, 5, 4));
  assert.equal(nthWeekdayOfMonth(2024, 11, 4, 4), '2024-11-28');
});
test('Gregorian Easter follows verified dates, remains Sunday and can cross March/April', () => {
  for (const [year, expected] of [[2008, '2008-03-23'], [2024, '2024-03-31'], [2025, '2025-04-20'], [2026, '2026-04-05'], [2027, '2027-03-28'], [2028, '2028-04-16'], [2038, '2038-04-25']]) assert.equal(easterDate(year), expected);
  for (let year = 2003; year <= 2100; year++) {const date = easterDate(year); assert(validDate(date)); assert.equal(localDate(date).getDay(), 0); assert(date >= `${year}-03-22` && date <= `${year}-04-25`);}
});
test('Mothers and Fathers dates use second Sundays, with validated calendar rules', () => {
  assert.equal(nthWeekdayOfMonth(2026, 5, 0, 2), '2026-05-10'); assert.equal(nthWeekdayOfMonth(2026, 8, 0, 2), '2026-08-09');
  assert.equal(nthWeekdayOfMonth(2027, 5, 0, 2), '2027-05-09'); assert.equal(nthWeekdayOfMonth(2027, 8, 0, 2), '2027-08-08');
  for (const args of [[2026, 0, 0, 2], [2026, 13, 0, 2], [2026, 5, 7, 2], [2026, 5, 0, 0], [2026, 2, 1, 5], [NaN, 1, 0, 1]]) assert.throws(() => nthWeekdayOfMonth(...args));
});
test('2026 supermarket commercial dates use verified references and remain read-only commercial entries', () => {
  const dates = commercialDates(2026);
  assert.deepEqual(dates.map(item => [item.title, item.start]), [
    ['Dia do Consumidor', '2026-03-15'], ['Páscoa', '2026-04-05'], ['Dia das Mães', '2026-05-10'], ['Dia dos Namorados', '2026-06-12'],
    ['Dia do Comerciante', '2026-07-16'], ['Dia dos Pais', '2026-08-09'], ['Dia do Feirante', '2026-08-25'], ['Dia do Cliente', '2026-09-15'],
    ['Dia das Crianças', '2026-10-12'], ['Black Friday', '2026-11-27']
  ]);
  for (const item of dates) {assert.equal(item.type, 'commercial'); assert.equal(item.readonly, true); assert.equal(item.start, item.end); assert(item.sourceUrl.startsWith('https://'));}
  assert(Object.isFrozen(commercialSources)); assert.equal(commercialDates(2027).find(item => item.title === 'Páscoa').sourceUrl, 'https://aa.usno.navy.mil/faq/easter');
  for (const invalid of [2002, 0, 10000, 2026.5, '2026']) {assert.deepEqual(commercialDates(invalid), []); assert.deepEqual(suggestedPeriods(invalid), []);}
});
test('Christmas and New Year reuse holiday IDs and appear in the commercial filter without duplicate dates', () => {
  const holidays = retailHolidays(2026), items = [...holidays, ...commercialDates(2026)];
  for (const date of ['2026-01-01', '2026-12-25']) {const found = items.filter(item => item.start === date); assert.equal(found.length, 1); assert.equal(found[0].type, 'holiday'); assert(found[0].categories.includes('commercial'));}
  assert.equal(filterCalendarItems(items, {type: 'commercial'}).length, 12); assert.equal(filterCalendarItems(items, {type: 'holiday'}).length, 9);
  assert.equal(filterCalendarItems(items, {query: 'ano novo'}).length, 1);
  const children = items.filter(item => item.start === '2026-10-12'); assert.equal(children.length, 2); assert(children.some(item => item.type === 'holiday')); assert(children.some(item => item.title === 'Dia das Crianças' && item.type === 'commercial'));
});
test('suggested seasonal windows are explicit suggestions and never holidays', () => {
  const periods = suggestedPeriods(2026); assert.equal(periods.length, 6);
  const map = Object.fromEntries(periods.map(item => [item.key, item]));
  assert.deepEqual([map.easter.start, map.easter.end], ['2026-03-08', '2026-04-05']);
  assert.deepEqual([map.june.start, map.june.end], ['2026-06-01', '2026-06-30']);
  assert.deepEqual([map.blackFridayPreparation.start, map.blackFridayPreparation.end], ['2026-11-01', '2026-11-26']);
  assert.deepEqual([map.blackFridayCampaign.start, map.blackFridayCampaign.end], ['2026-11-27', '2026-11-29']);
  assert.deepEqual([map.christmas.start, map.christmas.end], ['2026-12-01', '2026-12-25']);
  assert.deepEqual([map.newYear.start, map.newYear.end], ['2026-12-26', '2026-12-31']); assert.match(map.newYear.notes, /2027/);
  for (const item of periods) {assert.equal(item.type, 'season'); assert.equal(item.suggested, true); assert.equal(item.readonly, true); assert.match(item.notes, /Sugestão/); assert(validDate(item.start) && validDate(item.end) && item.start <= item.end);}
});
test('seasonal ranges are inclusive and agenda shows each period once when crossing month boundaries', () => {
  const periods = suggestedPeriods(2024), blackFriday = periods.find(item => item.key === 'blackFridayCampaign');
  assert.deepEqual([blackFriday.start, blackFriday.end], ['2024-11-29', '2024-12-01']);
  const december = filterCalendarItems(periods, monthBounds('2024-12-01')); assert(december.some(item => item.id === blackFriday.id));
  assert(!filterCalendarItems([blackFriday], {start: '2024-12-02', end: '2024-12-02'}).length);
  const agenda = retailAgendaGroups(periods, '2024-12-01');
  const instances = agenda.flatMap(group => group.entries); assert.equal(instances.length, december.length); assert.equal(instances.filter(item => item.id === blackFriday.id).length, 1);
  assert(agenda.find(group => group.date === '2024-12-01').entries.some(item => item.id === blackFriday.id));
});
test('commercial and seasonal generators do not persist, mutate or duplicate manual and campaign data', () => {
  const store = createCalendarStore(), entry = store.create({title: 'Promoção da loja', date: '2026-11-27', time: '08:00', type: 'event', color: 'green', notes: ''});
  const campaigns = [{id: 'campaign', name: 'Ofertas BF', start: '2026-11-27', end: '2026-11-29', notes: ''}];
  const items = [...calendarItems(store.list(), campaigns), ...commercialDates(2026), ...suggestedPeriods(2026), ...retailHolidays(2026)];
  assert.equal(new Set(items.map(item => item.id)).size, items.length); assert.equal(store.list().length, 1);
  const copy = commercialDates(2026); copy[0].title = 'Changed'; assert.equal(commercialDates(2026)[0].title, 'Dia do Consumidor');
  const periods = suggestedPeriods(2026); periods[0].start = '1900-01-01'; assert.equal(suggestedPeriods(2026)[0].start, '2026-03-08');
  store.remove(entry.id); assert.equal(commercialDates(2026).length, 10); assert.equal(campaigns[0].name, 'Ofertas BF');
});
test('moving retail dates remain identical across UTC-offset and DST time zones', () => {
  const url = new URL('../interno/calendario/commercial.js', import.meta.url).href;
  const code = `import {easterDate,blackFridayDate,nthWeekdayOfMonth} from ${JSON.stringify(url)};console.log(JSON.stringify([easterDate(2026),blackFridayDate(2024),nthWeekdayOfMonth(2026,5,0,2)]));`;
  for (const TZ of ['America/Sao_Paulo', 'America/Los_Angeles', 'Pacific/Kiritimati']) assert.deepEqual(JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {env: {...process.env, TZ}, encoding: 'utf8'})), ['2026-04-05', '2024-11-29', '2026-05-10']);
});
test('calendar separates commercial and seasonal filters and keeps default day cells uncluttered', async () => {
  const source = await readFile(new URL('../interno/calendario/index.js', import.meta.url), 'utf8');
  assert.match(source, /commercial: 'Data comercial', season: 'Sugestão sazonal'/); assert.match(source, /item.type !== 'season' \|\| state.type === 'season'/);
  assert.match(source, /calendar-seasonal-panel/); assert.match(source, /retailAgendaGroups\(items, state.month\)/); assert.match(source, /commercial \|\| season \?/);
  assert.match(source, /Fonte da data/); assert.match(source, /Sobre a data/);
  assert(!source.includes('calendar-storage-note')); assert(!source.includes('calendar-dialog-note'));
});
