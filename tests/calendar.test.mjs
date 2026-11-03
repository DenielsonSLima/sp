import {readDomainSource,readModuleSource,readDomainStyles} from './helpers/domain-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {validDate, localToday, localDate, addDays, shiftMonth, monthBounds, monthGrid, createCalendarStore, parseEntries, STORAGE_KEY, calendarItems, filterCalendarItems, entriesOnDate, agendaGroups} from './fixtures/legacy-operations/calendar-state.js';
import {createCampaignStore} from './fixtures/legacy-operations/campaign-state.js';
const fields = {title: 'Reunião da equipe', date: '2026-10-20', time: '08:30', type: 'event', color: 'blue', notes: 'Alinhar ofertas'};
const memory = () => {const data = new Map(); return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data};};

test('calendar validates real local dates, leap years and optional 24-hour time', () => {
  for (const date of ['2000-02-29', '2024-02-29', '0001-01-01', '9999-12-31']) assert(validDate(date), date);
  for (const date of ['1900-02-29', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-10-00', '0000-01-01', '2026-1-01', '2026-10-20T00:00:00Z', null]) assert(!validDate(date), String(date));
  const store = createCalendarStore();
  assert.equal(store.create({...fields, time: ''}).time, '');
  assert.equal(store.create({...fields, time: '23:59'}).time, '23:59');
  for (const time of ['24:00', '12:60', '8:00', null, 8]) { if (time === null) continue; assert.throws(() => store.create({...fields, time})); }
  assert.throws(() => store.create({...fields, title: ' '})); assert.throws(() => store.create({...fields, title: 'a'.repeat(121)}));
  assert.throws(() => store.create({...fields, type: 'promotion'})); assert.throws(() => store.create({...fields, color: 'url(x)'}));
  assert.throws(() => store.create({...fields, date: '2026-02-30'}));
});

test('month navigation clamps days, crosses years and produces Monday-first complete weeks', () => {
  assert.equal(shiftMonth('2026-01-31', 1), '2026-02-28'); assert.equal(shiftMonth('2024-01-31', 1), '2024-02-29');
  assert.equal(shiftMonth('2026-12-31', 1), '2027-01-31'); assert.equal(shiftMonth('2026-01-31', -1), '2025-12-31');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); assert.equal(addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(monthBounds('2024-02-14'), {start: '2024-02-01', end: '2024-02-29'});
  const grid = monthGrid('2026-10-20'); assert.equal(grid[0], '2026-09-28'); assert.equal(grid.at(-1), '2026-11-01'); assert.equal(grid.length, 35);
  assert.equal(localDate(grid[0]).getDay(), 1); assert.equal(new Set(grid).size, grid.length);
  assert.equal(monthGrid('2021-02-01').length, 28); assert.equal(monthGrid('2026-08-01').length, 42);
  assert(monthGrid('0001-01-01').includes('0001-01-01')); assert(monthGrid('9999-12-01').includes('9999-12-31'));
  assert.throws(() => shiftMonth('0001-01-01', -1)); assert.throws(() => addDays('9999-12-31', 1));
});

test('calendar uses local calendar days without UTC shifts across time zones and DST', () => {
  const url = new URL('../interno/calendario/state.js', import.meta.url).href;
  const script = `import {localToday,localDate,addDays} from ${JSON.stringify(url)};const date=new Date(2026,9,20,0,15);console.log(JSON.stringify([localToday(date),localToday(localDate('2026-10-20')),addDays('2026-03-07',2),addDays('2026-10-31',2)]));`;
  for (const TZ of ['America/Los_Angeles', 'America/Sao_Paulo', 'Pacific/Kiritimati', 'Europe/Berlin']) {
    assert.deepEqual(JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {env: {...process.env, TZ}, encoding: 'utf8'})), ['2026-10-20', '2026-10-20', '2026-03-09', '2026-11-02'], TZ);
  }
  assert.equal(localToday(localDate('0001-01-01')), '0001-01-01');
});

test('manual records persist, edit independently, delete and return cloned reads', () => {
  const storage = memory(), store = createCalendarStore(storage), first = store.create(fields), second = store.create({...fields, type: 'note', title: 'Pedir brindes', time: ''});
  assert.equal(createCalendarStore(storage).list().length, 2);
  store.update(first.id, {...fields, title: 'Reunião revisada', date: '2026-11-01', time: ''});
  assert.equal(createCalendarStore(storage).get(first.id).date, '2026-11-01'); assert.equal(store.get(first.id).time, '');
  const copy = store.list(); copy[0].title = 'mutated'; assert.equal(store.get(first.id).title, 'Reunião revisada');
  assert.throws(() => store.update(first.id, {...fields, date: '2026-11-31'})); assert.equal(store.get(first.id).date, '2026-11-01');
  store.remove(first.id); assert.equal(createCalendarStore(storage).list().length, 1); assert.equal(store.get(second.id).title, 'Pedir brindes');
  assert.throws(() => store.remove(first.id)); assert.throws(() => store.update('missing', fields));
  assert.deepEqual([...storage.data.keys()], [STORAGE_KEY]);
});

test('corrupt storage and quota errors never overwrite valid records or report a save', () => {
  let writes = 0;
  for (const raw of ['{broken', '', '{"version":2,"entries":[]}', '{"version":1,"entries":[{}]}']) {
    const store = createCalendarStore({getItem: () => raw, setItem: () => {writes++;}});
    assert(store.warning); assert.throws(() => store.create(fields)); assert.equal(writes, 0);
  }
  const storage = memory(), store = createCalendarStore(storage), record = store.create(fields), saved = storage.getItem(STORAGE_KEY);
  storage.setItem = () => {throw Error('quota');};
  assert.throws(() => store.create(fields), /salvar/); assert.throws(() => store.update(record.id, {...fields, title: 'Changed'}), /salvar/); assert.throws(() => store.remove(record.id), /salvar/);
  assert.equal(store.get(record.id).title, fields.title); assert.equal(storage.getItem(STORAGE_KEY), saved);
  assert.throws(() => parseEntries(JSON.stringify({version: 1, entries: [record, record]})), /duplicados/);
});

test('separate tabs preserve other records and stale deletes fail instead of recreating', () => {
  const storage = memory(), first = createCalendarStore(storage), second = createCalendarStore(storage);
  const a = first.create(fields), b = second.create({...fields, title: 'Second tab'});
  first.update(a.id, {...fields, title: 'Edited'}); assert.equal(first.list().length, 2); assert.equal(first.get(b.id).title, 'Second tab');
  second.remove(a.id); assert.throws(() => first.update(a.id, fields), /não encontrado/); first.reload(); assert.equal(first.list().length, 1);
});

test('campaigns are read-only live projections and date ranges include start/end across months', () => {
  const campaignStorage = memory(), campaigns = createCampaignStore(campaignStorage), calendarStorage = memory(), manual = createCalendarStore(calendarStorage);
  const campaign = campaigns.create({name: 'Ofertas da virada', start: '2026-10-30', end: '2026-11-02', notes: 'Açougue'});
  manual.create({...fields, date: '2026-10-31'});
  let all = calendarItems(manual.list(), campaigns.list());
  assert.equal(entriesOnDate(all, '2026-10-29').length, 0); assert.equal(entriesOnDate(all, '2026-10-30').length, 1); assert.equal(entriesOnDate(all, '2026-10-31').length, 2); assert.equal(entriesOnDate(all, '2026-11-02').length, 1); assert.equal(entriesOnDate(all, '2026-11-03').length, 0);
  assert.equal(filterCalendarItems(all, monthBounds('2026-11-01')).length, 1);
  assert.equal(all.find(item => item.type === 'promotion').href, `#promocoes/${campaign.id}`);
  campaigns.update(campaign.id, {name: 'Revisada', start: '2026-11-01', end: '2026-11-01', notes: ''});
  all = calendarItems(manual.list(), campaigns.list()); assert.equal(entriesOnDate(all, '2026-10-30').length, 0); assert.equal(entriesOnDate(all, '2026-11-01')[0].title, 'Revisada');
  assert(!calendarStorage.getItem(STORAGE_KEY).includes('Ofertas da virada')); assert(!calendarStorage.getItem(STORAGE_KEY).includes('Revisada')); assert.equal(manual.list().length, 1);
});

test('filters combine accentless search, type and inclusive period; agenda contains correct local dates', () => {
  const store = createCalendarStore(); store.create({...fields, title: 'Reunião Açougue', date: '2024-02-29', time: '09:00'}); store.create({...fields, type: 'note', title: 'Lembrete', date: '2024-02-29', time: ''});
  const items = calendarItems(store.list(), [{id: 'c1', name: 'Ofertas', start: '2024-02-28', end: '2024-03-01', notes: 'Açougue'}]);
  assert.equal(filterCalendarItems(items, {query: 'acougue'}).length, 2); assert.equal(filterCalendarItems(items, {query: 'acougue', type: 'event'}).length, 1);
  assert.equal(filterCalendarItems(items, {type: 'note', start: '2024-03-01'}).length, 0);
  assert.throws(() => filterCalendarItems(items, {start: '2024-03-01', end: '2024-02-29'}));
  const groups = agendaGroups(items, '2024-02-01'); assert.deepEqual(groups.map(group => group.date), ['2024-02-28', '2024-02-29']); assert.equal(groups[1].entries.length, 3);
  assert.equal(agendaGroups(items, '2024-03-01')[0].date, '2024-03-01');
});

test('calendar UI integrates read-only campaigns, native-enhanced selects, safe text, dialog confirmation and cleanup', async () => {
  const source = await readDomainSource('interno/calendario');
  assert.match(source, /loadCalendarCampaigns/); assert.match(source, /stopRealtime\(\)/); assert.match(source, /signalController\.abort\(\)/);
  assert.match(source, /data-confirm-delete/); assert.match(source, /Esta ação não pode ser desfeita/); assert.match(source, /esc\(item.title\)/);
  assert.match(source, /name="calendar-type"/); assert.match(source, /name="color"/); assert(!source.includes('campaignStore.update'));
  const css = await readDomainStyles('interno/calendario'); assert.match(css, /min-height:44px/); assert.match(css, /max-width:760px/);
});
