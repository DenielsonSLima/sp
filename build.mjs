import './scripts/check-architecture.mjs';
import './scripts/check-runtime.mjs';
import { cp, mkdir, rm, readFile, writeFile, mkdtemp, readdir, rename } from 'node:fs/promises';
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';

const stage = await mkdtemp('.dist-build-');
const preserveChunks = process.argv.includes('--preserve-chunks');
try {
await mkdir(`${stage}/vendor`, { recursive: true });
// Keep stylesheet/assets paths and maintenance tools compatible. The app itself
// executes only the hashed bundles referenced by the generated HTML.
for (const entry of ['index.html', 'assets', 'login', 'interno', 'shared'])
  await cp(entry, `${stage}/${entry}`, { recursive: true });
const result = await build({
  entryPoints: { app: 'shared/app.js', styles: 'shared/app.css' },
  outdir: `${stage}/app`, bundle: true, splitting: true, format: 'esm', platform: 'browser',
  target: 'es2022', minify: true, metafile: true, legalComments: 'eof',
  entryNames: '[name]-[hash]', chunkNames: 'chunks/[name]-[hash]', assetNames: 'media/[name]-[hash]',
  loader: { '.svg': 'file', '.png': 'file', '.jpg': 'file', '.jpeg': 'file', '.webp': 'file', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
});
const outputs = result.metafile.outputs;
const appEntry = Object.keys(outputs).find((file) => outputs[file].entryPoint === 'shared/app.js');
const cssEntry = Object.keys(outputs).find((file) => outputs[file].entryPoint === 'shared/app.css');
const imports = new Set();
function collect(file) {
  for (const item of outputs[file]?.imports ?? []) {
    if (item.kind !== 'import-statement' || item.external || imports.has(item.path)) continue;
    imports.add(item.path);
    collect(item.path);
  }
}
collect(appEntry);
const href = (file) => './' + file.slice(stage.length + 1);
let html = await readFile('index.html', 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*>/g, '').replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
html = html.replace('</head>', `<link rel="stylesheet" href="${href(cssEntry)}">${[...imports].map((file) => `<link rel="modulepreload" href="${href(file)}">`).join('')}</head>`);
html = html.replace('./shared/app.js', href(appEntry));
await writeFile(`${stage}/index.html`, html);
await writeFile(`${stage}/app/manifest.json`, JSON.stringify(result.metafile, null, 2).replaceAll(stage + '/', 'dist/'));
// Only opt-in maintenance pages still use the vendor import map.
for (const [specifier, name] of [['@supabase/supabase-js', 'supabase'], ['@tanstack/query-core', 'query-core']]) {
  await build({ stdin: { contents: `export * from ${JSON.stringify(specifier)};`, resolveDir: process.cwd() },
    outfile: `${stage}/vendor/${name}.js`, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof' });
}
let initialBytes = 0, initialGzip = 0;
for (const file of [appEntry, ...imports]) {
  const content = await readFile(file);
  initialBytes += content.length;
  initialGzip += gzipSync(content).length;
}
if (preserveChunks) {
  // Publish dependencies before the entry HTML. Existing tabs retain all hashes
  // they may dynamically import later in the same development session.
  await mkdir('dist', { recursive: true });
  for (const entry of await readdir(stage)) {
    if (entry !== 'index.html') await cp(`${stage}/${entry}`, `dist/${entry}`, { recursive: true });
  }
  await writeFile('dist/.index-next.html', html);
  await rename('dist/.index-next.html', 'dist/index.html');
} else {
  const previous = stage + '-previous';
  try { await rename('dist', previous); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await rename(stage, 'dist'); }
  catch (error) {
    try { await rename(previous, 'dist'); } catch {}
    throw error;
  }
  await rm(previous, { recursive: true, force: true });
}
console.log(`Aplicação empacotada: ${imports.size + 1} arquivos JS iniciais, ${initialBytes} bytes (${initialGzip} bytes gzip). Rotas carregadas sob demanda.`);
console.log('Site e bibliotecas preparados em dist/.');
} finally { await rm(stage, { recursive: true, force: true }); }
