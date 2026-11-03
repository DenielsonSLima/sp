import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { editorState, openDesign, commitDesign } from '../interno/encartes/editor-state.js';
import { createDesign, createTextElement } from '../interno/encartes/model.js';
test('editor starts blank and keeps edits in independent history', () => {
  const d = createDesign();
  openDesign(d);
  const edited = structuredClone(editorState.design);
  edited.elements.push(createTextElement(edited));
  commitDesign(edited);
  assert.equal(editorState.design.elements.length, 1);
  editorState.design = editorState.history.undo();
  assert.equal(editorState.design.elements.length, 0);
  editorState.design = editorState.history.redo();
  assert.equal(editorState.design.elements.length, 1);
});
test('editor exposes library tabs, real exports and guarded persistence', async () => {
  const paths = [
    'editor.js',
    'editor/autosave.js',
    'editor/properties.js',
    'editor/canvas-interaction.js',
    'editor/presentation.js',
    'views/studio.js',
  ];
  const src = (
    await Promise.all(paths.map((path) => readFile(new URL('../interno/encartes/' + path, import.meta.url), 'utf8')))
  ).join('\n');
  const compact = src.replace(/\s+/g, '');
  for (const text of [
    'Galeria',
    'Editor',
    'Criados',
    'Rascunhos',
    'createPngBlob',
    'saveDesign',
    'createCanvasInteraction',
    'await runtime.saveQueue.catch',
    'item.placeholder=false',
    'interno/encartes/styles.css',
  ])
    assert(compact.includes(text.replace(/\s+/g, '')), text);
  assert(!src.includes('fetch('));
  assert(!src.includes('Modelos'));
  assert(!src.includes('renderTemplateGallery'));
  assert(!src.includes('loadFlyerTemplates'));
  assert(!src.includes('flyer-import'));
  assert(!src.includes('flyer-backup'));
  assert(!src.includes("['products','Produtos']"));
  assert(!src.includes('Fundos e selos'));
  assert(!src.includes('loadLayerAssets'));
  assert(!src.includes("S.tool='products'"));
});
