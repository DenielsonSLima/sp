const paths = {
  'tabela-precos': 'M3 5h18v14H3zM3 10h18M9 5v14M15 5v14',
  calendario: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h1M12 14h1M16 14h1M8 18h1M12 18h1',
  devolucoes: 'M4 8h10a6 6 0 0 1 0 12H8M8 4 4 8l4 4',
  acougue: 'M15 3c-4 2-6 6-6 10l4 3 7-10c1-2-2-4-5-3ZM9 13l-6 6 2 2 8-5',
  empresa: 'M3 21h18M5 21V4h14v17M8 8h2M14 8h2M8 12h2M14 12h2M10 21v-5h4v5',
  usuarios:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-4',
  perfis: 'm12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7ZM8 12l3 3 5-6',
  marca: 'M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z',
  encartes: 'M5 3h14v18H5zM8 7h8M8 11h3v4H8zM14 11h2M14 15h2M8 18h8',
  promocoes: 'M3 3h8l10 10-8 8L3 11ZM7 7h.01M10 16l6-6',
  inicio: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  cadastros: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  cotacao: 'M8 3h8v4H8zM8 5H5v16h14V5h-3M8 12h8M8 16h5',
  hortifruti: 'M20 4C8 2 2 9 6 16c7 5 15-1 14-12ZM4 21 16 9',
  configuracoes: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  arrow: 'M5 12h14M14 7l5 5-5 5',
  exit: 'M9 4H4v16h5M10 12h11M16 7l5 5-5 5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14M5 12h14',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6',
};
export const icon = (name) =>
  `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(
    paths[name] || paths.cadastros
  )
    .split('~')
    .map((d) => `<path d="${d}"/>`)
    .join('')}</svg>`;
