import {readDomainSource,readModuleSource} from './helpers/domain-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nationalHolidays, holidaySources, HOLIDAY_MIN_YEAR} from '../interno/calendario/holidays.js';
import {monthOptions, monthOptionLabel, calendarOpeningPeriod, shiftMonth, monthBounds, calendarItems, filterCalendarItems, createCalendarStore} from './fixtures/legacy-operations/calendar-state.js';

test('month/year list starts with current month and displays Portuguese month names across December', () => {
  const october = monthOptions('2026-10-01', '2026-10-20');
  assert.deepEqual(october.slice(0, 4), [
    {value: '2026-10', label: 'Outubro 2026'}, {value: '2026-11', label: 'Novembro 2026'},
    {value: '2026-12', label: 'Dezembro 2026'}, {value: '2027-01', label: 'Janeiro 2027'}
  ]);
  assert.equal(october.length, 24); assert.equal(monthOptionLabel('2028-02-29'), 'Fevereiro 2028');
  const december = monthOptions('2026-12-01', '2026-12-31'); assert.equal(december[1].label, 'Janeiro 2027');
});
test('arrow navigation extends month choices and always includes selected and current periods', () => {
  for (const selected of ['2026-09-01', '2025-12-01', '2028-12-01', '9999-12-01', '0001-01-01']) {
    const choices = monthOptions(selected, '2026-10-20');
    assert(choices.some(item => item.value === selected.slice(0, 7)), selected);
    assert(choices.some(item => item.value === '2026-10')); assert(choices.length <= 48);
    assert.equal(new Set(choices.map(item => item.value)).size, choices.length);
    assert.deepEqual(choices.map(item => item.value), choices.map(item => item.value).sort());
  }
  const next = shiftMonth('2026-12-01', 1); assert(monthOptions(next, '2026-12-31').some(item => item.value === '2027-01'));
});
test('each opening derives today and current month from the current local date', () => {
  assert.deepEqual(calendarOpeningPeriod(new Date(2026, 9, 20, 23, 55)), {month: '2026-10-01', selected: '2026-10-20'});
  assert.deepEqual(calendarOpeningPeriod(new Date(2026, 11, 31, 23, 59)), {month: '2026-12-01', selected: '2026-12-31'});
  assert.deepEqual(calendarOpeningPeriod(new Date(2027, 0, 1, 0, 1)), {month: '2027-01-01', selected: '2027-01-01'});
});
test('2026 contains exactly the nine federally legislated fixed national holidays', () => {
  const days = nationalHolidays(2026);
  assert.deepEqual(days.map(item => [item.start, item.title]), [
    ['2026-01-01', 'Confraternização Universal'], ['2026-04-21', 'Tiradentes'], ['2026-05-01', 'Dia Mundial do Trabalho'],
    ['2026-09-07', 'Independência do Brasil'], ['2026-10-12', 'Nossa Senhora Aparecida'], ['2026-11-02', 'Finados'],
    ['2026-11-15', 'Proclamação da República'], ['2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'], ['2026-12-25', 'Natal']
  ]);
  for (const item of days) {assert.equal(item.type, 'holiday'); assert.equal(item.start, item.end); assert.equal(item.readonly, true); assert.equal(item.time, ''); assert(item.sourceUrl.startsWith('https://www.planalto.gov.br/'));}
  assert.equal(new Set(days.map(item => item.id)).size, 9);
});
test('future national dates recur by year and do not classify optional or municipal observances as national', () => {
  for (const year of [2027, 2028, 2030]) {const days = nationalHolidays(year); assert.equal(days.length, 9); assert(days.every(item => item.start.startsWith(`${year}-`)));}
  const dates = nationalHolidays(2026).map(item => item.start);
  for (const date of ['2026-02-16', '2026-02-17', '2026-02-18', '2026-04-03', '2026-04-05', '2026-06-04', '2026-10-28', '2026-12-24', '2026-12-31']) assert(!dates.includes(date), date);
  assert.equal(nationalHolidays(2023).length, 8); assert(!nationalHolidays(2023).some(item => item.start.endsWith('11-20'))); assert.equal(nationalHolidays(2024).length, 9);
  assert.equal(HOLIDAY_MIN_YEAR, 2003); for (const invalid of [2002, 0, 10000, 2026.5, '2026', NaN]) assert.deepEqual(nationalHolidays(invalid), []);
});
test('national holidays remain independent of stored manual records and campaign projections', () => {
  const manual = createCalendarStore(); const entry = manual.create({title: 'Abertura especial', date: '2026-10-12', time: '08:00', type: 'event', color: 'green', notes: ''});
  const campaigns = [{id: 'offer', name: 'Oferta de outubro', start: '2026-10-11', end: '2026-10-13', notes: ''}];
  const items = [...calendarItems(manual.list(), campaigns), ...nationalHolidays(2026)];
  assert.equal(filterCalendarItems(items, {start: '2026-10-12', end: '2026-10-12'}).length, 3);
  assert.equal(filterCalendarItems(items, {...monthBounds('2026-11-01'), type: 'holiday'}).length, 3);
  assert.equal(filterCalendarItems(items, {type: 'holiday', query: 'consciencia negra'}).length, 1);
  assert.equal(manual.list().length, 1); manual.remove(entry.id); assert.equal(nationalHolidays(2026).length, 9);
  const copy = nationalHolidays(2026); copy[0].title = 'Changed'; assert.equal(nationalHolidays(2026)[0].title, 'Confraternização Universal');
  assert.equal(holidaySources[1].url, 'https://www.planalto.gov.br/ccivil_03/leis/l6802.htm'); assert.match(holidaySources[2].url, /l14759\.htm$/);
});
test('calendar wires enhanced month select, current-month reset and read-only sourced holidays', async () => {
  const source = await readDomainSource('interno/calendario');
  assert.match(source, /Mês\/ano<select name="calendar-month" data-searchable="true">/); assert(!source.includes('type="month"'));
  assert.match(source, /export async function render\(root\) \{[\s\S]*?dispose\?\.\(\);[\s\S]*?Object.assign\(state, calendarOpeningPeriod\(\)\)/);
  assert.match(source, /flatMap\(retailHolidays\)/); assert.match(source, /holiday: 'Feriado nacional'/); assert.match(source, /holiday \? `<a class="button secondary"/);
  assert.match(source, /Fonte oficial/); assert.match(source, /calendar-holiday-coverage/); assert(!source.includes('calendar-storage-note'));
});
