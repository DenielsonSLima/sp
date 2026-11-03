export const FONT_GROUPS = Object.freeze({
  'Ofertas e preços': Object.freeze([
    'Anton', 'Bebas Neue', 'Oswald', 'Barlow Condensed', 'Roboto Condensed',
    'Archivo Black', 'Passion One', 'Staatliches',
  ]),
  'Chamadas especiais': Object.freeze([
    'Alfa Slab One', 'Bungee', 'Lilita One', 'Paytone One', 'Fugaz One', 'Righteous',
  ]),
  'Produtos e informações': Object.freeze([
    'Montserrat', 'Poppins', 'Nunito Sans', 'Rubik', 'Lato', 'Barlow',
  ]),
  'Fontes do sistema': Object.freeze(['Arial', 'Verdana', 'Georgia', 'Impact', 'Trebuchet MS']),
});

export const FONTS = Object.freeze(Object.values(FONT_GROUPS).flat());
const bundledFonts = new Set(FONTS.filter((font) => !FONT_GROUPS['Fontes do sistema'].includes(font)));

// Canvas does not trigger CSS font downloads. Load both weights before measuring/exporting.
export async function loadPosterFonts(template, fontSet = globalThis.document?.fonts) {
  if (!fontSet) return;
  await fontSet.ready;
  const families = new Set(Object.values(template.layout).filter((element) => !element.hidden).map((element) => element.fontFamily));
  await Promise.all([...families].flatMap((family) => [700, 900].map(async (weight) => {
    try {
      const faces = await fontSet.load(`${weight} 24px "${family}"`, 'OFERTA Açúcar R$ 0,99');
      if (bundledFonts.has(family) && !faces?.length) throw Error('Fonte não disponível.');
    } catch {
      throw Error(`Não foi possível carregar a fonte ${family}. Recarregue a página e tente novamente.`);
    }
  })));
}
