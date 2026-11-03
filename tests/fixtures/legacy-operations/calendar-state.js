// Explicit legacy fixtures for regression tests only. Never imported by the application.
import {saveRecord,deleteRecord} from '../../../shared/data/api.js';
import {createOperationalStore} from '../../../interno/operational-store.js';
const remote=createOperationalStore('calendar_events');
export const loadCalendar=()=>false?remote.load():Promise.resolve([]);
/** Calendar-only records. Campaigns are projected at read time and never persisted here. */
export const STORAGE_KEY = 'supermercado-calendar-entries-v1';
export const entryTypes = {event: 'Evento', note: 'Anotação'};
export const entryColors = {blue: 'Azul', green: 'Verde', orange: 'Laranja', purple: 'Roxo', red: 'Vermelho'};
const clone = value => JSON.parse(JSON.stringify(value));
const pad = value => String(value).padStart(2, '0');
const leap = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
export const daysInMonth = (year, month) => [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 0;
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}
export const localToday = (date = new Date()) => `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export function localDate(value) {
  if (!validDate(value)) throw Error('Informe uma data válida.');
  const [year, month, day] = value.split('-').map(Number);
  // Noon avoids DST boundary gaps. Never parse a date-only string as a UTC timestamp.
  const result = new Date(2000, 0, 1, 12); result.setFullYear(year, month - 1, day); return result;
}
export function addDays(value, amount) {
  if (!Number.isInteger(amount)) throw Error('Intervalo de dias inválido.');
  const date = localDate(value); date.setDate(date.getDate() + amount);
  const result = localToday(date); if (!validDate(result)) throw Error('A data está fora do período permitido.'); return result;
}
export function shiftMonth(value, amount) {
  if (!validDate(value) || !Number.isInteger(amount)) throw Error('Mês inválido.');
  const [year, month, day] = value.split('-').map(Number), index = year * 12 + month - 1 + amount;
  const nextYear = Math.floor(index / 12), nextMonth = index % 12 + 1;
  const result = `${String(nextYear).padStart(4, '0')}-${pad(nextMonth)}-${pad(Math.min(day, daysInMonth(nextYear, nextMonth)))}`;
  if (!validDate(result)) throw Error('O mês está fora do período permitido.'); return result;
}
export function monthBounds(value) {
  if (!validDate(value)) throw Error('Mês inválido.');
  const [year, month] = value.split('-').map(Number);
  return {start: `${value.slice(0, 7)}-01`, end: `${value.slice(0, 7)}-${pad(daysInMonth(year, month))}`};
}
export function calendarOpeningPeriod(date = new Date()) {
  const selected = localToday(date); return {month: monthBounds(selected).start, selected};
}
export function monthOptionLabel(value) {
  const month = localDate(value).toLocaleDateString('pt-BR', {month: 'long'});
  return `${month[0].toLocaleUpperCase('pt-BR')}${month.slice(1)} ${Number(value.slice(0, 4))}`;
}
/** Upcoming months first; include the selected period when arrows leave that window. */
export function monthOptions(selected, current = localToday()) {
  const currentMonth = monthBounds(current).start, selectedMonth = monthBounds(selected).start, values = new Set();
  for (const base of [currentMonth, selectedMonth]) {
    for (let offset = 0; offset < 24; offset++) { try { values.add(shiftMonth(base, offset)); } catch { break; } }
  }
  return [...values].sort().map(date => ({value: date.slice(0, 7), label: monthOptionLabel(date)}));
}
export function monthGrid(value) {
  const {start, end} = monthBounds(value), offset = (localDate(start).getDay() + 6) % 7;
  const length = Math.ceil((offset + Number(end.slice(-2))) / 7) * 7;
  return Array.from({length}, (_, index) => { try { return addDays(start, index - offset); } catch { return null; } });
}
const clean = (value, max, label) => {
  if (typeof value !== 'string' || value.length > max) throw Error(`${label}: use até ${max} caracteres.`);
  return value.trim();
};
const validId = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
export function entryFields(input) {
  if (!input || typeof input !== 'object') throw Error('Registro inválido.');
  const title = clean(input.title, 120, 'Título'); if (!title) throw Error('Informe um título.');
  if (!validDate(input.date)) throw Error('Informe uma data válida.');
  const time = input.time ?? ''; if (typeof time !== 'string' || time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Informe um horário válido.');
  if (!Object.hasOwn(entryTypes, input.type)) throw Error('Escolha evento ou anotação.');
  if (!Object.hasOwn(entryColors, input.color)) throw Error('Escolha uma cor da lista.');
  return {title, date: input.date, time, type: input.type, color: input.color, notes: clean(input.notes ?? '', 4000, 'Detalhes')};
}
export function normalizeEntry(input) {
  if (!input || !validId(input.id)) throw Error('Registro inválido.');
  return {id: input.id, ...entryFields(input), createdAt: typeof input.createdAt === 'string' ? input.createdAt : '', updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : ''};
}
export function parseEntries(raw) {
  if (typeof raw !== 'string' || raw.length > 5000000) throw Error('Arquivo do calendário inválido.');
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || !Array.isArray(data.entries) || data.entries.length > 1000) throw Error('Arquivo do calendário inválido.');
  const entries = data.entries.map(normalizeEntry);
  if (new Set(entries.map(item => item.id)).size !== entries.length) throw Error('Há registros duplicados no calendário.');
  return entries;
}
export function createCalendarStore(storage = null) {
  let entries = [], warning = '', blocked = false;
  const read = () => {
    try { const raw = storage?.getItem(STORAGE_KEY); entries = raw == null ? [] : parseEntries(raw); warning = ''; blocked = false; return true; }
    catch { warning = 'Não foi possível ler o calendário salvo. Recarregue a página antes de tentar salvar; os dados existentes serão preservados.'; blocked = true; return false; }
  };
  read();
  const prepare = () => { if (storage) read(); if (blocked) throw Error(warning); };
  const commit = next => {
    const normalized = next.map(normalizeEntry), raw = JSON.stringify({version: 1, entries: normalized});
    if (normalized.length > 1000 || raw.length > 5000000) throw Error('O limite de registros do calendário foi atingido.');
    if (storage) { try { storage.setItem(STORAGE_KEY, raw); } catch { throw Error('Não foi possível salvar. Verifique o espaço e a permissão de armazenamento do navegador.'); } }
    else if (typeof window !== 'undefined') throw Error('O navegador não permite salvar o calendário.');
    entries = normalized;
  };
  const get = id => { const entry = entries.find(item => item.id === id); if (!entry) throw Error('Registro não encontrado. Ele pode ter sido removido em outra aba.'); return clone(entry); };
  return {
    list: () => clone(entries), get, reload: read, get warning() { return warning; },
    create(input) { prepare(); const now = new Date().toISOString(), id = globalThis.crypto?.randomUUID?.() || `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const entry = {id, ...entryFields(input), createdAt: now, updatedAt: now}; commit([...entries, entry]); return clone(entry); },
    update(id, input) { prepare(); const previous = get(id), entry = {...previous, ...entryFields(input), updatedAt: new Date().toISOString()}; commit(entries.map(item => item.id === id ? entry : item)); return clone(entry); },
    remove(id) { prepare(); get(id); commit(entries.filter(item => item.id !== id)); }
  };
}
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function projectCampaigns(campaigns) {
  return campaigns.filter(item => item && validId(item.id) && validDate(item.start) && validDate(item.end) && item.start <= item.end).map(item => ({
    id: `promotion:${item.id}`, sourceId: item.id, type: 'promotion', title: String(item.name || 'Campanha'), start: item.start, end: item.end,
    time: '', color: 'red', notes: String(item.notes || ''), href: `#promocoes/${encodeURIComponent(item.id)}`
  }));
}
export function calendarItems(entries, campaigns = []) {
  return [...entries.map(item => ({...item, sourceId: item.id, id: `manual:${item.id}`, start: item.date, end: item.date})), ...projectCampaigns(campaigns)];
}
export function filterCalendarItems(items, {start = '', end = '', type = '', query = ''} = {}) {
  if (start && !validDate(start) || end && !validDate(end) || start && end && start > end) throw Error('Informe um período válido.');
  const needle = fold(query).trim();
  return items.filter(item => (!start || item.end >= start) && (!end || item.start <= end) && (!type || item.type === type || Array.isArray(item.categories) && item.categories.includes(type)) && (!needle || fold(`${item.title} ${item.notes}`).includes(needle)))
    .sort((a, b) => a.start.localeCompare(b.start) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'pt-BR') || a.id.localeCompare(b.id));
}
export const entriesOnDate = (items, date) => filterCalendarItems(items, {start: date, end: date});
export function agendaGroups(items, value) {
  const {start, end} = monthBounds(value), groups = [];
  for (let date = start;; date = addDays(date, 1)) { const entries = entriesOnDate(items, date); if (entries.length) groups.push({date, entries}); if (date === end) break; }
  return groups;
}
let storage = null; try { storage = globalThis.localStorage ?? null; } catch {}
const localCalendar=createCalendarStore(storage);
const remoteCalendar={list:()=>remote.list(),get:id=>remote.get(id),reload:()=>remote.load(),warning:'',
 async create(input){const saved=await saveRecord('calendar_events',{...input,id:crypto.randomUUID()});remote.accept(saved);return saved;},
 async update(id,input){const current=remote.get(id);const saved=await saveRecord('calendar_events',{...current,...input,id},{expectedVersion:current._version});remote.accept(saved);return saved;},
 async remove(id){const current=remote.get(id);await deleteRecord('calendar_events',id,{expectedVersion:current._version});remote.remove(id);}};
export const calendarStore=new Proxy({}, {get:(_,key)=>(false?remoteCalendar:localCalendar)[key]});
