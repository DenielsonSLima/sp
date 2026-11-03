import { box, shape, text } from './layout.js';

export const FLYER_MODEL_PRESETS = Object.freeze([
  { id: 'natal-ceia', name: 'Natal em família', description: 'Cabeçalho natalino, ofertas claras e fotos em destaque.',
    primary: '#a81a22', accent: '#e7bd67', background: '#fff3dd', ink: '#442923', secondary: '#7c1119',
    layout: 'christmas-feast', headline: 'NATAL\nEM FAMÍLIA',
    headerAsset: './assets/encartes/camadas/modelo-natal-cabecalho.png' },
  { id: 'natal-presentes', name: 'Natal de presentes', description: 'Fundo verde claro, preços vermelhos e nomes abaixo das ofertas.',
    primary: '#bd1628', accent: '#bbce91', background: '#eff8de', ink: '#25402b', secondary: '#34653e',
    layout: 'christmas-gifts', headline: 'NATAL\nDE PRESENTES',
    headerAsset: './assets/encartes/camadas/modelo-natal-presentes.png' },
  { id: 'natal-semana', name: 'Semana do Natal', description: 'Cartões retangulares, nomes no topo e preços sobre dourado.',
    primary: '#a91920', accent: '#f5cf72', background: '#a91920', ink: '#23472f', secondary: '#205234',
    layout: 'christmas-week', headline: 'SEMANA\nDO NATAL',
    headerAsset: './assets/encartes/camadas/modelo-natal-semana.png' },
  { id: 'povo', name: 'Ofertas do Povo', description: 'Vermelho e amarelo para as ofertas da semana.',
    primary: '#bd1427', accent: '#ffe54f', background: '#fff6de', ink: '#281c20', secondary: '#8a1020' },
  { id: 'natal', name: 'Natal', description: 'Verde, vermelho e detalhes dourados para a ceia.',
    primary: '#164d3b', accent: '#e6bd72', background: '#f8f4e9', ink: '#263d33', secondary: '#9e1c32' },
  { id: 'fim-de-ano', name: 'Fim de ano', description: 'Vinho e dourado para as últimas ofertas do ano.',
    primary: '#5e1939', accent: '#e9bd67', background: '#f9f0e4', ink: '#392333', secondary: '#3e1830' },
  { id: 'ano-novo', name: 'Ano Novo', description: 'Azul profundo, estrelas e dourado para celebrar.',
    primary: '#142449', accent: '#f5d184', background: '#eef3fb', ink: '#1e2d45', secondary: '#213c64' },
  { id: 'verao', name: 'Verão', description: 'Azul, coral e sol para as ofertas de verão.',
    primary: '#076e83', accent: '#ffbd62', background: '#e8f8fb', ink: '#174653', secondary: '#d65643' },
  { id: 'hortifruti', name: 'Hortifruti', description: 'Verde e formas orgânicas para produtos frescos.',
    primary: '#226740', accent: '#dcdf76', background: '#f1f7e7', ink: '#264232', secondary: '#164c35' },
].map(Object.freeze));

/** Editable vector decorations; no generated or remotely loaded artwork. */
export function modelDecorations(preset, width, height) {
  const u = width / 1080, elements = [], right = width - 155 * u;
  const disc = (id, x, y, size, fill, opacity = 1) => ({
    ...shape(id, box(x * u, y * u, size * u, size * u), fill), shapeKind: 'ellipse', opacity,
  });
  if (preset.id === 'natal') {
    for (let i = 0; i < 3; i++) {
      const x = (right / u) + i * 45;
      elements.push(shape(`natal-fio-${i}`, box((x + 16) * u, 0, 2 * u, (25 + i * 14) * u), preset.accent));
      elements.push(disc(`natal-bola-${i}`, x, 22 + i * 14, 34, i % 2 ? '#bd2942' : preset.accent, .75));
    }
  } else if (preset.id === 'fim-de-ano') {
    for (let i = 0; i < 4; i++) elements.push({
      ...shape(`fim-de-ano-faixa-${i}`, box(width - (155 - i * 40) * u, 0, 17 * u, 163 * u), preset.accent),
      rotation: 24, opacity: .19,
    });
  } else if (preset.id === 'ano-novo') {
    for (let i = 0; i < 6; i++) elements.push(text(`ano-novo-estrela-${i}`, '✦',
      box(width - (170 - (i % 3) * 57) * u, (15 + Math.floor(i / 3) * 66) * u, 35 * u, 42 * u),
      { color: preset.accent, fontSize: (20 + i % 2 * 13) * u, opacity: .45, align: 'center' }));
  } else if (preset.id === 'verao') {
    elements.push(disc('verao-sol', width / u - 142, 18, 112, preset.accent, .8));
    elements.push({ ...shape('verao-onda', box(0, height - 82 * u, width, 20 * u), '#72cbd2', 20 * u), opacity: .6 });
  } else if (preset.id === 'hortifruti') {
    for (let i = 0; i < 3; i++) elements.push({
      ...shape(`hortifruti-folha-${i}`, box(width - (143 - i * 39) * u, (20 + i * 21) * u, 45 * u, 75 * u), preset.accent),
      shapeKind: 'ellipse', rotation: 35, opacity: .35,
    });
  } else {
    elements.push(disc('povo-detalhe-grande', width / u - 140, 17, 110, preset.accent, .16));
    elements.push(disc('povo-detalhe-pequeno', width / u - 65, 94, 35, '#ffffff', .22));
  }
  return elements;
}
