import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const project = new URL('../', import.meta.url);

async function filesUnder(directory, extension) {
  const names = await readdir(new URL(directory, project), { recursive: true });
  return names.filter((name) => name.endsWith(extension))
    .map((name) => new URL(directory + name.replaceAll('\\', '/'), project));
}

async function stylesheetGraph(entry, visited = new Set()) {
  if (visited.has(entry.href)) return visited;
  visited.add(entry.href);
  const source = await readFile(entry, 'utf8');
  for (const match of source.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?\s*;/g)) {
    await stylesheetGraph(new URL(match[1], entry), visited);
  }
  return visited;
}

test('all module and shared component styles load with the initial document', async () => {
  const html = await readFile(new URL('index.html', project), 'utf8');
  assert.match(html, /<head>[\s\S]*<link rel="stylesheet" href="\.\/shared\/app\.css">[\s\S]*<\/head>/);
  const graph = await stylesheetGraph(new URL('shared/app.css', project));
  for (const file of [
    ...await filesUnder('interno/', '.css'),
    ...await filesUnder('shared/components/', '.css'),
  ]) assert.ok(graph.has(file.href), `Missing persistent stylesheet: ${file.pathname}`);
});

test('rendering a module or dialog cannot remove and reinsert its stylesheet', async () => {
  for (const file of [
    ...await filesUnder('interno/', '.js'),
    ...await filesUnder('shared/components/', '.js'),
  ]) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /<link\b[^>]*rel=["']stylesheet["']/, file.pathname);
    assert.doesNotMatch(source, /\.rel\s*=\s*["']stylesheet["']/, file.pathname);
  }
});
