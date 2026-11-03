// Run explicitly to refresh the bundled Google Fonts and their original licenses.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const families = [
  ['Anton', '400', 'Ofertas e preços'],
  ['Bebas Neue', '400', 'Ofertas e preços'],
  ['Oswald', '200..700', 'Ofertas e preços'],
  ['Barlow Condensed', '700;900', 'Ofertas e preços'],
  ['Roboto Condensed', '100..900', 'Ofertas e preços'],
  ['Archivo Black', '400', 'Ofertas e preços'],
  ['Alfa Slab One', '400', 'Chamadas especiais'],
  ['Bungee', '400', 'Chamadas especiais'],
  ['Lilita One', '400', 'Chamadas especiais'],
  ['Paytone One', '400', 'Chamadas especiais'],
  ['Passion One', '400;700;900', 'Ofertas e preços'],
  ['Fugaz One', '400', 'Chamadas especiais'],
  ['Righteous', '400', 'Chamadas especiais'],
  ['Staatliches', '400', 'Ofertas e preços'],
  ['Montserrat', '100..900', 'Produtos e informações'],
  ['Poppins', '700;900', 'Produtos e informações'],
  ['Nunito Sans', '200..900', 'Produtos e informações'],
  ['Rubik', '300..900', 'Produtos e informações'],
  ['Lato', '700;900', 'Produtos e informações'],
  ['Barlow', '700;900', 'Produtos e informações'],
];
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const fetchBytes = (url) => execFileSync('curl', ['-fsSL', '--retry', '2', '--max-time', '45', '-A', userAgent, url]);
const root = new URL('../assets/fonts/posters/', import.meta.url);
mkdirSync(root, { recursive: true });
const catalog = [];
const rules = [];
for (const [family, weights, group] of families) {
  const slug = family.toLowerCase().replaceAll(' ', '-');
  const upstream = `https://github.com/google/fonts/tree/main/ofl/${slug.replaceAll('-', '')}`;
  const license = fetchBytes(`https://raw.githubusercontent.com/google/fonts/main/ofl/${slug.replaceAll('-', '')}/OFL.txt`);
  if (!license.toString().includes('SIL OPEN FONT LICENSE')) throw Error(`Licença inesperada: ${family}`);
  writeFileSync(new URL(`${slug}-OFL.txt`, root), license);
  const source = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@${weights}&display=swap`;
  const css = fetchBytes(source).toString();
  const faces = [...css.matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[^}]+\})/g)];
  if (!faces.length) throw Error(`Subconjunto latino ausente: ${family}`);
  const files = [];
  for (const [, face] of faces) {
    const url = face.match(/url\(([^)]+)\)/)[1];
    const weight = face.match(/font-weight:\s*([^;]+)/)[1];
    const filename = `${slug}-${weight.replaceAll(' ', '-')}.woff2`;
    const bytes = fetchBytes(url);
    if (bytes.subarray(0, 4).toString() !== 'wOF2') throw Error(`Formato inesperado: ${family}`);
    writeFileSync(new URL(filename, root), bytes);
    rules.push(face.replace(url, `./${filename}`));
    files.push({ filename, weight, source: url, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  catalog.push({ family, group, license: 'OFL-1.1', licenseFile: `${slug}-OFL.txt`, upstream, source, files });
  console.log(`${family}: ${files.length} arquivo(s)`);
}
writeFileSync(new URL('fonts.css', root), '/* Google Fonts — SIL OFL 1.1. See catalog.json and individual licenses. */\n' + rules.join('\n\n') + '\n');
writeFileSync(new URL('catalog.json', root), JSON.stringify(catalog, null, 2) + '\n');
