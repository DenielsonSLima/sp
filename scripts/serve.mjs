import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = resolve('dist');
const port = Number(process.env.PORT || 4173);
const watching = process.argv.includes('--watch');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.pdf': 'application/pdf',
};
const cache = new Map();
const cacheLimit = 32 * 1024 * 1024;
let cacheBytes = 0;
let building = false, rebuildRequested = false, timer;
function build() {
  if (building) { rebuildRequested = true; return Promise.resolve(); }
  building = true;
  return new Promise((resolveBuild) => {
    const child = spawn(process.execPath, ['build.mjs', '--preserve-chunks'], { stdio: 'inherit' });
    child.on('exit', (code) => {
      building = false;
      cache.clear();
      cacheBytes = 0;
      if (code) console.error('Build falhou. Corrija o erro antes de atualizar a página.');
      else console.log('Build atualizado. Recarregue a página quando terminar a edição atual.');
      resolveBuild();
      if (rebuildRequested) { rebuildRequested = false; void build(); }
    });
    child.on('error', (error) => { building = false; console.error(error); resolveBuild(); });
  });
}
if (watching) await build();

const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); return response.end(); }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + sep)) { response.writeHead(403); return response.end(); }
    const info = await stat(file);
    if (!info.isFile()) { response.writeHead(404); return response.end(); }
    let entry = cache.get(file);
    if (!entry || entry.modified !== info.mtimeMs) {
      const raw = await readFile(file), type = mime[extname(file)] || 'application/octet-stream';
      const compressed = /text\/|application\/(json|javascript)|image\/svg/.test(type) && raw.length > 1024 ? gzipSync(raw) : null;
      if (entry) { cacheBytes -= entry.bytes; cache.delete(file); }
      entry = { raw, compressed, type, modified: info.mtimeMs, bytes: raw.length + (compressed?.length || 0),
        etag: 'W/"' + createHash('sha256').update(raw).digest('hex').slice(0, 24) + '"' };
      if (entry.bytes <= cacheLimit / 4) {
        while (cache.size && (cacheBytes + entry.bytes > cacheLimit || cache.size >= 256)) {
          const oldest = cache.keys().next().value;
          cacheBytes -= cache.get(oldest).bytes;
          cache.delete(oldest);
        }
        cache.set(file, entry);
        cacheBytes += entry.bytes;
      }
    }
    const hashed = /\/app\/(?:chunks\/|media\/)?[^/]+-[A-Z0-9]{8}\.[^/]+$/.test(file);
    response.setHeader('Content-Type', entry.type);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
    response.setHeader('ETag', entry.etag);
    response.setHeader('Vary', 'Accept-Encoding');
    if (request.headers['if-none-match'] === entry.etag) { response.writeHead(304); return response.end(); }
    const gzip = entry.compressed && /\bgzip\b/.test(request.headers['accept-encoding'] || '');
    const body = gzip ? entry.compressed : entry.raw;
    if (gzip) response.setHeader('Content-Encoding', 'gzip');
    response.setHeader('Content-Length', body.length);
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400);
    response.end('Arquivo indisponível.');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Sistema em http://127.0.0.1:${server.address().port}${watching ? ' · build automático ativo' : ''}`));
server.on('error', (error) => { console.error(error.message); process.exit(1); });

const watchers = [];
if (watching) {
  for (const directory of ['shared', 'interno', 'login', 'assets']) {
    watchers.push(watch(directory, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void build(), 300);
    }));
  }
  for (const file of ['index.html', 'build.mjs']) watchers.push(watch(file, () => {
    clearTimeout(timer);
    timer = setTimeout(() => void build(), 300);
  }));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  clearTimeout(timer);
  watchers.forEach((watcher) => watcher.close());
  server.close(() => process.exit());
});
