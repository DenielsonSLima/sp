import {heading, escapeHtml as esc} from '../../shared/ui.js';
import {icon} from '../../shared/icons.js';
import {createEditorCloseGuard} from './editor-guard.js';
import {holidaySources, HOLIDAY_MIN_YEAR} from './holidays.js';
import {commercialDates, suggestedPeriods, retailHolidays, retailAgendaGroups} from './commercial.js';
import {readCampaigns, subscribeCampaigns, campaignStore} from '../promocoes/state.js';
import {calendarStore as store, STORAGE_KEY, entryTypes, entryColors, localToday, localDate, validDate, addDays, shiftMonth, monthBounds, monthGrid, calendarOpeningPeriod, monthOptions, calendarItems, filterCalendarItems, entriesOnDate, agendaGroups} from './state.js';

const state = {...calendarOpeningPeriod(), view: null, type: '', query: ''};
const typeNames = {promotion: 'Promoção', holiday: 'Feriado nacional', commercial: 'Data comercial', season: 'Sugestão sazonal', ...entryTypes};
const shortDate = value => value.split('-').reverse().join('/');
const dateLabel = value => localDate(value).toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
const monthLabel = value => localDate(value).toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
let dispose;

export async function render(root) {
  dispose?.();
  Object.assign(state, calendarOpeningPeriod());
  state.view ||= window.matchMedia('(max-width:760px)').matches ? 'agenda' : 'month';
  store.reload();
  root.innerHTML = `<link rel="stylesheet" href="./interno/calendario/styles.css"><section class="calendar-module">
    ${heading('PLANEJAMENTO DA LOJA', 'Calendário', 'Promoções, datas comerciais e períodos sazonais para planejar a loja.')}
    <div class="calendar-toolbar"><div class="calendar-period-nav"><button class="button secondary calendar-arrow" type="button" data-action="previous" aria-label="Mês anterior">‹</button><h2 class="calendar-period" aria-live="polite"></h2><button class="button secondary calendar-arrow" type="button" data-action="next" aria-label="Próximo mês">›</button><button class="button secondary" type="button" data-action="today">Hoje</button></div><button class="button primary" type="button" data-action="new">${icon('plus')} Novo registro</button></div>
    <section class="card calendar-filters" aria-label="Filtros do calendário"><label class="calendar-search">Buscar no calendário<input name="calendar-query" type="search" maxlength="200" placeholder="Título, campanha ou detalhes…" value="${esc(state.query)}"></label><label>Tipo de registro<select name="calendar-type">${option('', 'Todos os tipos', state.type)}${Object.entries(typeNames).map(([key, label]) => option(key, label, state.type)).join('')}</select></label><label>Mês/ano<select name="calendar-month" data-searchable="true">${monthOptions(state.month).map(item => option(item.value, item.label, state.month.slice(0, 7))).join('')}</select></label><button class="button secondary calendar-clear" data-action="clear" type="button">Limpar filtros</button></section>
    <div class="calendar-view-bar"><p class="calendar-count" aria-live="polite"></p><div class="calendar-view-switch module-tabs" role="group" aria-label="Visualização do calendário"><button type="button" data-action="view" data-view="month">Mês</button><button type="button" data-action="view" data-view="agenda">Agenda</button></div></div>
    <p class="calendar-warning" role="alert"></p><p class="calendar-feedback" role="status" aria-live="polite"></p><div class="calendar-seasonal"></div><div class="calendar-board"></div>
    <p class="calendar-holiday-coverage" role="status"></p><p class="calendar-sources">Fontes oficiais dos feriados: ${holidaySources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a>`).join(' · ')}</p>
  </section>`;
  const section = root.querySelector('.calendar-module');
  const signalController = new AbortController();
  const signal = signalController.signal;
  let removed = false;
  const connected = () => !removed && section.isConnected;
  const readItems = () => {
    const year = Number(state.month.slice(0, 4));
    return [...calendarItems(store.list(), readCampaigns()), ...[year - 1, year, year + 1].flatMap(retailHolidays), ...[year - 1, year, year + 1].flatMap(commercialDates), ...[year - 1, year, year + 1].flatMap(suggestedPeriods)];
  };
  const filtered = () => filterCalendarItems(readItems(), {query: state.query, type: state.type});
  const feedback = text => { if (connected()) section.querySelector('.calendar-feedback').textContent = text; };
  const focusDay = () => section.querySelector(`[data-day="${state.selected}"]`)?.focus({preventScroll: true});

  function itemMarkup(item) {
    const promotion = item.type === 'promotion', holiday = item.type === 'holiday', season = item.type === 'season', commercial = item.type === 'commercial';
    return `<article class="calendar-entry calendar-color-${esc(item.color)}" data-entry="${esc(item.id)}"><div class="calendar-entry-heading"><span class="calendar-type">${esc(typeNames[item.type])}</span>${item.categories?.includes('commercial') ? '<span class="calendar-type">Data comercial</span>' : ''}<span class="calendar-entry-time">${promotion || season ? `${shortDate(item.start)} a ${shortDate(item.end)}` : item.time || 'Dia inteiro'}</span></div><h4>${esc(item.title)}</h4>${item.notes ? `<p class="calendar-entry-notes">${esc(item.notes)}</p>` : ''}<div class="calendar-entry-actions">${promotion ? `<a class="button secondary" href="${esc(item.href)}">Abrir campanha →</a>` : holiday ? `<a class="button secondary" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fonte oficial ↗</a>` : commercial || season ? (item.sourceUrl ? `<a class="button secondary" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${season ? 'Sobre a data' : 'Fonte da data'} ↗</a>` : '') : `<button class="button secondary" type="button" data-action="edit" data-id="${esc(item.sourceId)}" aria-label="Editar ${esc(item.title)}">Editar</button><button class="button calendar-delete" type="button" data-action="delete" data-id="${esc(item.sourceId)}" aria-label="Excluir ${esc(item.title)}">Excluir</button>`}</div></article>`;
  }
  function dayDetails(items) {
    const entries = entriesOnDate(items, state.selected);
    return `<aside class="card calendar-day-details" aria-labelledby="calendar-day-title"><div class="calendar-day-heading"><span class="eyebrow">DIA SELECIONADO</span><h3 id="calendar-day-title">${esc(dateLabel(state.selected))}</h3><button class="button secondary" type="button" data-action="new" data-date="${state.selected}">+ Adicionar neste dia</button></div>${entries.length ? entries.map(itemMarkup).join('') : '<p class="calendar-day-empty">Nenhum registro neste dia com os filtros atuais.</p>'}</aside>`;
  }
  function monthMarkup(items) {
    const days = monthGrid(state.month), now = localToday();
    return `<div class="calendar-month-layout"><div class="card calendar-month-card"><div class="calendar-grid-scroll"><div class="calendar-month-grid" role="grid" aria-label="${esc(monthLabel(state.month))}"><div class="calendar-week calendar-weekdays" role="row">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(day => `<span role="columnheader">${day}</span>`).join('')}</div>${Array.from({length: days.length / 7}, (_, week) => `<div class="calendar-week" role="row">${days.slice(week * 7, week * 7 + 7).map(day => {
      if (!day) return '<div class="calendar-day calendar-day-placeholder" role="gridcell"></div>';
      const entries = entriesOnDate(items, day), selected = day === state.selected;
      return `<div class="calendar-day ${day.slice(0, 7) !== state.month.slice(0, 7) ? 'outside-month' : ''} ${day === now ? 'is-today' : ''} ${selected ? 'is-selected' : ''}" role="gridcell" aria-selected="${selected}"><button type="button" data-day="${day}" tabindex="${selected ? '0' : '-1'}" ${day === now ? 'aria-current="date"' : ''} aria-label="${esc(dateLabel(day))}, ${entries.length} registro(s)"><span class="calendar-day-number">${Number(day.slice(-2))}</span><span class="calendar-day-items" aria-hidden="true">${entries.slice(0, 2).map(item => `<span class="calendar-day-chip calendar-color-${esc(item.color)}">${item.time ? `${esc(item.time)} ` : ''}${esc(item.title)}</span>`).join('')}${entries.length > 2 ? `<span class="calendar-more">+ ${entries.length - 2}<span class="calendar-more-label"> registro(s)</span></span>` : ''}</span></button></div>`;
    }).join('')}</div>`).join('')}</div></div><div class="calendar-grid-help">Selecione um dia para ver os registros. Use as setas do teclado para navegar.</div></div>${dayDetails(items)}</div>`;
  }
  function agendaMarkup(items) {
    const groups = retailAgendaGroups(items, state.month);
    return `<div class="calendar-agenda" aria-label="Agenda de ${esc(monthLabel(state.month))}">${groups.length ? groups.map(group => `<section class="card calendar-agenda-day ${group.date === localToday() ? 'is-today' : ''}" aria-labelledby="agenda-${group.date}"><div class="calendar-agenda-date"><span class="calendar-agenda-number">${Number(group.date.slice(-2))}</span><h3 id="agenda-${group.date}">${esc(localDate(group.date).toLocaleDateString('pt-BR', {weekday: 'long', month: 'long'}))}${group.date === localToday() ? '<span class="calendar-today-label">Hoje</span>' : ''}</h3><button class="button secondary" type="button" data-action="new" data-date="${group.date}" aria-label="Adicionar registro em ${esc(dateLabel(group.date))}">+ Adicionar</button></div><div class="calendar-agenda-items">${group.entries.map(itemMarkup).join('')}</div></section>`).join('') : `<div class="card calendar-empty"><div class="calendar-empty-symbol" aria-hidden="true">▦</div><h3>Nenhum registro neste mês</h3><p>${state.query || state.type ? 'Ajuste os filtros para encontrar outros registros.' : 'Adicione eventos e anotações. Suas campanhas também aparecem aqui nas datas cadastradas.'}</p><button class="button secondary" type="button" data-action="${state.query || state.type ? 'clear' : 'new'}">${state.query || state.type ? 'Limpar filtros' : '+ Adicionar um registro'}</button></div>`}</div>`;
  }
  function seasonalMarkup(items) {
    if (!items.length) return '';
    return `<section class="card calendar-seasonal-panel" aria-labelledby="calendar-seasonal-title"><div class="calendar-seasonal-heading"><h3 id="calendar-seasonal-title">Períodos sazonais do mês</h3><p>Janelas sugeridas para planejar as campanhas da loja.</p></div><div class="calendar-seasonal-grid">${items.map(itemMarkup).join('')}</div></section>`;
  }
  function draw() {
    if (!connected()) return;
    const matches = filtered(), items = matches.filter(item => item.type !== 'season' || state.type === 'season'), monthItems = filterCalendarItems(matches, monthBounds(state.month));
    const periods = state.type === '' ? monthItems.filter(item => item.type === 'season') : [];
    section.querySelector('.calendar-period').textContent = monthLabel(state.month);
    const monthSelect = section.querySelector('[name=calendar-month]'), options = monthOptions(state.month);
    if ([...monthSelect.options].map(item => item.value).join(',') !== options.map(item => item.value).join(',')) monthSelect.innerHTML = options.map(item => option(item.value, item.label, state.month.slice(0, 7))).join('');
    monthSelect.value = state.month.slice(0, 7);
    section.querySelector('[data-action=previous]').disabled = state.month === '0001-01-01';
    section.querySelector('[data-action=next]').disabled = state.month === '9999-12-01';
    section.querySelectorAll('[data-action=view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
    const count = type => monthItems.filter(item => item.type === type || item.categories?.includes(type)).length;
    section.querySelector('.calendar-count').textContent = `${monthItems.length} registro(s) no mês · ${count('promotion')} promoção(ões), ${count('event')} evento(s), ${count('note')} anotação(ões), ${count('holiday')} feriado(s), ${count('commercial')} data(s) comercial(is), ${count('season')} período(s) sugerido(s)`;
    section.querySelector('.calendar-holiday-coverage').textContent = Number(state.month.slice(0, 4)) < HOLIDAY_MIN_YEAR ? `A referência de feriados nacionais está disponível a partir de ${HOLIDAY_MIN_YEAR}.` : '';
    section.querySelector('.calendar-warning').textContent = [store.warning, campaignStore.warning].filter(Boolean).join(' ');
    section.querySelector('.calendar-seasonal').innerHTML = seasonalMarkup(periods);
    section.querySelector('.calendar-board').innerHTML = state.view === 'month' ? monthMarkup(items) : agendaMarkup(items);
  }
  function selectDate(date, focus = false) {
    if (!validDate(date)) return;
    state.selected = date; state.month = monthBounds(date).start; draw(); if (focus) focusDay();
  }
  function navigate(amount) {
    try { const month = shiftMonth(state.month, amount); state.month = monthBounds(month).start; state.selected = shiftMonth(state.selected, amount); draw(); }
    catch (error) { feedback(error.message); }
  }
  function closeDialog(dialog, trigger, fallback = true) {
    dialog.close(); dialog.remove();
    if (trigger?.isConnected) trigger.focus(); else if (fallback) (section.querySelector(`[data-day="${state.selected}"]`) || section.querySelector('[data-action=new]'))?.focus({preventScroll: true});
  }
  function showEditor(trigger, id = '', date = state.selected) {
    if (section.querySelector('dialog')) return;
    let entry;
    try { entry = id ? store.get(id) : {title: '', date, time: '', type: 'event', color: 'blue', notes: ''}; }
    catch (error) { feedback(error.message); draw(); return; }
    const dialog = document.createElement('dialog'); dialog.className = 'calendar-dialog'; dialog.setAttribute('aria-labelledby', 'calendar-editor-title');
    dialog.innerHTML = `<form><div class="calendar-dialog-heading"><div><span class="eyebrow">CALENDÁRIO DA LOJA</span><h2 id="calendar-editor-title">${id ? 'Editar registro' : 'Novo registro'}</h2></div><button class="button secondary calendar-close" type="button" data-close aria-label="Fechar formulário">×</button></div><div class="calendar-fields"><label class="calendar-wide">Título<input name="title" required maxlength="120" value="${esc(entry.title)}" placeholder="Ex.: Reunião da equipe"></label><label>Tipo<select name="type">${Object.entries(entryTypes).map(([key, label]) => option(key, label, entry.type)).join('')}</select></label><label>Cor<select name="color">${Object.entries(entryColors).map(([key, label]) => option(key, label, entry.color)).join('')}</select></label><label>Data<input name="date" type="date" min="0001-01-01" max="9999-12-31" required value="${entry.date}"></label><label>Horário (opcional)<input name="time" type="time" value="${entry.time}"></label><label class="calendar-wide">Detalhes (opcional)<textarea name="notes" maxlength="4000" rows="4" placeholder="Anotações e informações para lembrar depois…">${esc(entry.notes)}</textarea></label></div><p class="calendar-form-error" role="alert"></p><div class="calendar-dialog-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="submit">Salvar registro</button></div></form>`;
    section.append(dialog); dialog.showModal();
    const form = dialog.querySelector('form');
    const guard = createEditorCloseGuard({form, host: section, onClose: () => closeDialog(dialog, trigger)});
    dialog.querySelector('[data-cancel]').onclick = guard.requestClose; dialog.querySelector('[data-close]').onclick = guard.requestClose;
    dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); guard.requestClose(); });
    form.onsubmit = event => {
      event.preventDefault();
      try {
        const values = Object.fromEntries(new FormData(event.currentTarget));
        const saved = id ? store.update(id, values) : store.create(values);
        guard.dispose(); closeDialog(dialog, trigger, false); selectDate(saved.date);
        (section.querySelector(`[data-day="${state.selected}"]`) || section.querySelector('[data-action=new]'))?.focus({preventScroll: true});
        feedback(`${id ? 'Alterações salvas' : 'Registro salvo'} neste navegador.${state.query || state.type ? ' Os filtros atuais continuam aplicados.' : ''}`);
      } catch (error) { dialog.querySelector('.calendar-form-error').textContent = error.message; }
    };
    dialog.querySelector('[name=title]').focus();
  }
  function confirmDelete(trigger, id) {
    if (section.querySelector('dialog')) return;
    let entry; try { entry = store.get(id); } catch (error) { feedback(error.message); draw(); return; }
    const dialog = document.createElement('dialog'); dialog.className = 'calendar-dialog calendar-confirm'; dialog.setAttribute('aria-labelledby', 'calendar-delete-title');
    dialog.innerHTML = `<h2 id="calendar-delete-title">Excluir ${entry.type === 'note' ? 'anotação' : 'evento'}?</h2><p>“${esc(entry.title)}”, em ${shortDate(entry.date)}, será excluído deste navegador. Esta ação não pode ser desfeita.</p><p class="calendar-form-error" role="alert"></p><div class="calendar-dialog-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="button" data-confirm-delete>Excluir registro</button></div>`;
    section.append(dialog); dialog.showModal();
    const close = () => closeDialog(dialog, trigger);
    dialog.querySelector('[data-cancel]').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.querySelector('[data-confirm-delete]').onclick = () => {
      try { store.remove(id); closeDialog(dialog, trigger, false); draw(); (section.querySelector(`[data-day="${state.selected}"]`) || section.querySelector('[data-action=new]'))?.focus({preventScroll: true}); feedback('Registro excluído.'); }
      catch (error) { dialog.querySelector('.calendar-form-error').textContent = error.message; }
    };
    dialog.querySelector('[data-cancel]').focus();
  }
  section.addEventListener('click', event => {
    const day = event.target.closest('[data-day]'); if (day) { selectDate(day.dataset.day, true); return; }
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (action === 'previous' || action === 'next') navigate(action === 'previous' ? -1 : 1);
    if (action === 'today') selectDate(localToday());
    if (action === 'view') { state.view = button.dataset.view; draw(); }
    if (action === 'clear') { state.type = ''; state.query = ''; section.querySelector('[name=calendar-type]').value = ''; section.querySelector('[name=calendar-query]').value = ''; draw(); feedback('Filtros limpos.'); }
    if (action === 'new') showEditor(button, '', button.dataset.date || state.selected);
    if (action === 'edit') showEditor(button, button.dataset.id);
    if (action === 'delete') confirmDelete(button, button.dataset.id);
  }, {signal});
  section.addEventListener('keydown', event => {
    const button = event.target.closest('[data-day]'); if (!button || event.altKey || event.ctrlKey || event.metaKey) return;
    const offsets = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7};
    let date;
    try {
      if (Object.hasOwn(offsets, event.key)) date = addDays(button.dataset.day, offsets[event.key]);
      else if (event.key === 'Home') date = addDays(button.dataset.day, -(localDate(button.dataset.day).getDay() + 6) % 7);
      else if (event.key === 'End') date = addDays(button.dataset.day, 6 - (localDate(button.dataset.day).getDay() + 6) % 7);
      else if (event.key === 'PageUp' || event.key === 'PageDown') date = shiftMonth(button.dataset.day, event.key === 'PageUp' ? -1 : 1);
      else return;
      event.preventDefault(); selectDate(date, true);
    } catch { event.preventDefault(); }
  }, {signal});
  section.querySelector('[name=calendar-query]').oninput = event => { state.query = event.target.value; draw(); };
  section.querySelector('[name=calendar-type]').onchange = event => { state.type = event.target.value; draw(); };
  section.querySelector('[name=calendar-month]').onchange = event => { const date = `${event.target.value}-01`; if (validDate(date)) selectDate(date); else { event.target.value = state.month.slice(0, 7); feedback('Escolha um mês válido.'); } };
  const unsubscribe = subscribeCampaigns(() => draw());
  const observer = new MutationObserver(() => { if (!section.isConnected) cleanup(); });
  observer.observe(document.body, {childList: true, subtree: true});
  function cleanup() { if (removed) return; removed = true; unsubscribe(); signalController.abort(); observer.disconnect(); section.querySelectorAll('dialog').forEach(dialog => dialog.close()); }
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) { store.reload(); draw(); } }, {signal});
  window.addEventListener('focus', () => { store.reload(); draw(); }, {signal});
  dispose = cleanup;
  draw();
}
