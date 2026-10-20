import {addDays, localDate, validDate, daysInMonth, monthBounds, agendaGroups, filterCalendarItems} from './state.js';
import {nationalHolidays} from './holidays.js';
const pad = number => String(number).padStart(2, '0');
const supportedYear = year => Number.isInteger(year) && year >= 2003 && year <= 9998;
const dateOf = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;
export function nthWeekdayOfMonth(year, month, weekday, occurrence) {
  if (!supportedYear(year) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !Number.isInteger(occurrence) || occurrence < 1 || occurrence > 5) throw Error('Regra de data inválida.');
  const first = dateOf(year, month, 1), day = 1 + (weekday - localDate(first).getDay() + 7) % 7 + (occurrence - 1) * 7;
  if (day > daysInMonth(year, month)) throw Error('Esta ocorrência não existe no mês.');
  return dateOf(year, month, day);
}
/** Gregorian computus; computed as a date-only local calendar value. */
export function easterDate(year) {
  if (!supportedYear(year)) throw Error('Ano fora do período disponível.');
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451), value = h + l - 7 * m + 114;
  return dateOf(year, Math.floor(value / 31), value % 31 + 1);
}
// Black Friday follows the fourth Thursday, and can be November's fifth Friday.
export const blackFridayDate = year => addDays(nthWeekdayOfMonth(year, 11, 4, 4), 1);

export const commercialSources = Object.freeze({
  consumer: 'https://www.gov.br/anpd/pt-br/assuntos/noticias/dia-do-consumidor-1',
  easter: 'https://www.gov.br/prf/pt-br/noticias/estaduais/ceara/2026/marco/prf-inicia-operacao-semana-santa-2026-no-ceara-com-reforco-nas-rodovias-federais',
  mothers: 'https://www.planalto.gov.br/ccivil_03/decreto/1930-1949/d21366.htm',
  valentines: 'https://goias.gov.br/procon/procon-goias-identifica-variacao-de-ate-185-nos-precos-de-presentes-para-o-dia-dos-namorados/',
  fathers: 'https://cliente.sebraees.com.br/calendario-promocional',
  customer: 'https://agenciasebrae.com.br/cultura-empreendedora/dia-do-cliente-vira-aquecimento-para-a-black-friday-e-oportunidade-para-pequenos-negocios/',
  children: 'https://www.gov.br/dnit/pt-br/assuntos/campanhas-e-eventos/educacao-para-o-transito/artes/2021/12-de-outubro-dia-das-criancas-1.jpg/view',
  merchant: 'https://www.planalto.gov.br/ccivil_03/leis/1950-1969/l2048.htm',
  market: 'https://maceio.al.gov.br/noticias/secom/dia-do-feirante-celebra-trabalhadores-que-mantem-viva-a-tradicao-das-feiras',
  blackFriday: 'https://sebrae.com.br/Sebrae/Portal%20Sebrae/Arquivos/E-Book_Prepare-se_para_a_Black_Friday_2022.pdf.pdf',
  june: 'https://educa.ibge.gov.br/criancas/voce-sabia/22429-santos-juninos.html'
});
const commercialRecord = (year, key, title, date, notes) => ({
  id: `commercial:br:${key}:${year}`, sourceId: `br:${key}:${year}`, type: 'commercial', title,
  start: date, end: date, time: '', color: 'commercial', notes, readonly: true, sourceUrl: key === 'easter' && year !== 2026 ? 'https://aa.usno.navy.mil/faq/easter' : commercialSources[key] || ''
});
export function commercialDates(year) {
  if (!supportedYear(year)) return [];
  return [
    ['consumer', 'Dia do Consumidor', dateOf(year, 3, 15), 'Ideias: ofertas de itens de giro e ações de fidelização.'],
    ['easter', 'Páscoa', easterDate(year), 'Ideias: chocolates, pescados e ingredientes para o almoço.'],
    ['mothers', 'Dia das Mães', nthWeekdayOfMonth(year, 5, 0, 2), 'Ideias: cestas, chocolates e almoço em família.'],
    ['valentines', 'Dia dos Namorados', dateOf(year, 6, 12), 'Ideias: ingredientes para um jantar especial, queijos e chocolates.'],
    ['merchant', 'Dia do Comerciante', dateOf(year, 7, 16), 'Data comemorativa do setor. Ideias: ações com a equipe e parceiros.'],
    ['fathers', 'Dia dos Pais', nthWeekdayOfMonth(year, 8, 0, 2), 'Ideias: carnes, acompanhamentos e almoço em família.'],
    ['market', 'Dia do Feirante', dateOf(year, 8, 25), 'Ideias: valorizar o hortifruti, produtores e a tradição das feiras.'],
    ['customer', 'Dia do Cliente', dateOf(year, 9, 15), 'Ideias: ações de relacionamento e fidelização.'],
    ['children', 'Dia das Crianças', dateOf(year, 10, 12), 'Ideias: doces, sucos e lanches. Coincide com o feriado nacional de Nossa Senhora Aparecida.'],
    ['blackFriday', 'Black Friday', blackFridayDate(year), 'Ideias: planejar estoque, preços e comunicação das ofertas.']
  ].map(([key, title, date, notes]) => commercialRecord(year, key, title, date, notes));
}
export function suggestedPeriods(year) {
  if (!supportedYear(year)) return [];
  const dates = Object.fromEntries(commercialDates(year).map(item => [item.sourceId.split(':')[1], item]));
  const before = (key, title, lead, notes) => ({key, title, start: addDays(dates[key].start, -lead), end: dates[key].start, sourceUrl: dates[key].sourceUrl, notes});
  const blackFriday = dates.blackFriday.start;
  const periods = [
    before('easter', 'Preparação para a Páscoa', 28, 'Sugestão: antecipar compras, exposição e ofertas de chocolates, pescados e ingredientes.'),
    {key: 'june', title: 'Festas juninas', start: dateOf(year, 6, 1), end: dateOf(year, 6, 30), sourceUrl: commercialSources.june, notes: 'Sugestão de campanha durante junho: milho, amendoim, canjica, pipoca e ingredientes típicos.'},
    {key: 'blackFridayPreparation', title: 'Preparação para a Black Friday', start: dateOf(year, 11, 1), end: addDays(blackFriday, -1), sourceUrl: commercialSources.blackFriday, notes: 'Sugestão: revisar estoque, preços e materiais de divulgação antes da data.'},
    {key: 'blackFridayCampaign', title: 'Fim de semana da Black Friday', start: blackFriday, end: addDays(blackFriday, 2), sourceUrl: commercialSources.blackFriday, notes: 'Sugestão de campanha da sexta ao domingo. Ajuste suas ofertas e quantidades ao planejamento da loja.'},
    {key: 'christmas', title: 'Campanha de Natal', start: dateOf(year, 12, 1), end: dateOf(year, 12, 25), sourceUrl: '', notes: 'Sugestão: preparar a ceia, panetones, frutas secas, cestas e itens de presente.'},
    {key: 'newYear', title: 'Campanha de Ano Novo', start: dateOf(year, 12, 26), end: dateOf(year, 12, 31), sourceUrl: '', notes: `Sugestão: organizar os itens para a virada e as confraternizações de 1º de janeiro de ${year + 1}.`}
  ];
  return periods.filter(item => validDate(item.start) && validDate(item.end)).map(item => ({
    ...item, id: `season:br:${item.key}:${year}`, sourceId: `br:${item.key}:${year}`, type: 'season', time: '', color: 'season', readonly: true, suggested: true
  }));
}
/** Keep a single holiday record for Christmas/New Year while exposing commercial context. */
export function retailHolidays(year) {
  return nationalHolidays(year).map(item => {
    if (item.start.endsWith('-12-25')) return {...item, categories: ['commercial'], notes: 'Também é uma data comercial. Ideias para o Natal: ceia, panetones, frutas secas, cestas e presentes.'};
    if (item.start.endsWith('-01-01')) return {...item, categories: ['commercial'], notes: 'Ano Novo. Também é uma data comercial para planejar a virada e as confraternizações.'};
    return item;
  });
}
/** A suggested period appears once in the agenda, even when it spans many days. */
export function retailAgendaGroups(items, month) {
  const bounds = monthBounds(month), groups = agendaGroups(items.filter(item => item.type !== 'season'), month);
  const byDate = new Map(groups.map(group => [group.date, group]));
  for (const item of filterCalendarItems(items.filter(item => item.type === 'season'), bounds)) {
    const date = item.start < bounds.start ? bounds.start : item.start;
    if (!byDate.has(date)) byDate.set(date, {date, entries: []});
    byDate.get(date).entries.push(item);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
