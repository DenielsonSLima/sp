import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const roots = ['interno', 'shared', 'login'];
const extensions = new Set(['.js', '.mjs', '.css']);
const maxLines = 500;
const files = [];
async function visit(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const child = path.join(folder, entry.name);
    if (entry.isDirectory()) await visit(child);
    else if (extensions.has(path.extname(entry.name))) files.push(child);
  }
}
for (const root of roots) await visit(root);
const failures = [];
let largest = { file: '', lines: 0 };
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const lines = source.replace(/\n$/, '').split('\n').length;
  if (lines > largest.lines) largest = { file, lines };
  if (lines > maxLines) failures.push(`${file}: ${lines} linhas (limite ${maxLines})`);
}
if (failures.length) throw Error(failures.join('\n'));
console.log(
  `Arquitetura: ${files.length} arquivos da aplicação com até ${maxLines} linhas. Maior: ${largest.file} (${largest.lines}).`,
);
