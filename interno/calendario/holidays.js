/** Fixed national holidays, verified against federal legislation on 2026-10-20.
 * Religious municipal holidays and federal optional days are intentionally absent.
 * Historical coverage starts with the consolidated national list effective in 2003.
 */
export const HOLIDAY_MIN_YEAR = 2003;
export const holidaySources = Object.freeze([
  {label: 'Lei nº 662/1949', url: 'https://www.planalto.gov.br/ccivil_03/leis/l0662.htm'},
  {label: '12 de outubro', url: 'https://www.planalto.gov.br/ccivil_03/leis/l6802.htm'},
  {label: '20 de novembro', url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm'}
].map(Object.freeze));
const definitions = [
  ['01-01', 'Confraternização Universal', 0, 2003],
  ['04-21', 'Tiradentes', 0, 2003],
  ['05-01', 'Dia Mundial do Trabalho', 0, 2003],
  ['09-07', 'Independência do Brasil', 0, 2003],
  ['10-12', 'Nossa Senhora Aparecida', 1, 2003],
  ['11-02', 'Finados', 0, 2003],
  ['11-15', 'Proclamação da República', 0, 2003],
  // Law 14.759 was published on 2023-12-22: first national occurrence is 2024-11-20.
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 2, 2024],
  ['12-25', 'Natal', 0, 2003]
];
export function nationalHolidays(year) {
  if (!Number.isInteger(year) || year < HOLIDAY_MIN_YEAR || year > 9999) return [];
  return definitions.filter(([, , , from]) => year >= from).map(([day, title, source]) => {
    const date = `${year}-${day}`;
    return {id: `holiday:br:${date}`, sourceId: `br:${date}`, type: 'holiday', title, start: date, end: date,
      time: '', color: 'holiday', notes: '', readonly: true, sourceUrl: holidaySources[source].url};
  });
}
