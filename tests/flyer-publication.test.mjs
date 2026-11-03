import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign, validateDesign, validatePublication, createHistory } from '../interno/encartes/model.js';
import { createFlyerRepository, exportDesignJson, parseDesignJson } from '../interno/encartes/storage.js';
import { publicationId, publicationFromId, groupPublicationSummaries } from '../interno/encartes/publication.js';

const publication = {
  kind: 'campaign', groupId: '11111111-1111-4111-8111-111111111111', campaignId: 'promotion-1',
  campaignVersion: 2, pageIndex: 0, pageCount: 3, templateId: 'grid-6', themeId: 'povo', formatId: 'portrait',
};

test('campaign page provenance survives validation, history, JSON backup and versioned saves', async () => {
  const original = { ...createDesign({ title: 'Encarte da semana' }), publication };
  assert.deepEqual(validateDesign(original).publication, publication);
  const history = createHistory(original);
  history.commit({ ...original, title: 'Título revisado' });
  assert.deepEqual(history.undo().publication, publication);
  assert.deepEqual(history.redo().publication, publication);
  assert.deepEqual(parseDesignJson(exportDesignJson(original)).publication, publication);
  const stored = new Map();
  const repository = createFlyerRepository({
    context: () => ({ companyId: 'company-1', user: { id: 'user-1' } }),
    save: async (value, options) => {
      assert.equal(options.expectedVersion, stored.has(value.id) ? 1 : null);
      const result = { ...value, _version: stored.has(value.id) ? 2 : 1 };
      stored.set(value.id, result);
      return result;
    },
    list: async () => [...stored.values()],
    read: async (id) => stored.get(id),
  });
  const first = await repository.saveDesign(original);
  const reopened = await repository.getDesign(first.id);
  await repository.saveDesign({ ...reopened, title: 'Editado' });
  assert.deepEqual((await repository.listDesignSummaries())[0].publication, publication);
});

test('legacy artwork remains valid without publication metadata', () => {
  const artwork = validateDesign(createDesign());
  assert.equal(Object.hasOwn(artwork, 'publication'), false);
  assert.equal(Object.hasOwn(validateDesign({ ...artwork, publication: null }), 'publication'), false);
});

test('publication metadata rejects malformed indices, versions and identifiers', () => {
  const bad = [
    { pageCount: 0 }, { pageCount: 1001 }, { pageCount: 2.5 }, { pageIndex: -1 }, { pageIndex: 3 },
    { campaignVersion: 0 }, { campaignVersion: Number.MAX_SAFE_INTEGER + 1 },
    { groupId: '../other' }, { campaignId: '' }, { themeId: '<script>' }, { kind: 'photo' },
  ];
  for (const patch of bad) assert.throws(() => validatePublication({ ...publication, ...patch }));
  for (const input of [null, [], 'campaign']) assert.throws(() => validatePublication(input));
  assert.deepEqual(validatePublication({ ...publication, prices: [999], companyId: 'other' }), publication);
});

test('existing metadata ids identify and order saved pages without fetching documents', () => {
  const first = publicationId(publication.groupId, 0), last = publicationId(publication.groupId, 2);
  assert.deepEqual(publicationFromId(last), { groupId: publication.groupId, pageIndex: 2 });
  assert.equal(publicationFromId('legacy-art'), null);
  assert.equal(publicationFromId('encarte_group_01'), null);
  assert.equal(publicationFromId('encarte_group_-1'), null);
  assert.throws(() => publicationId('bad/id', 0));
  assert.throws(() => publicationId('group', 1000));
  const groups = groupPublicationSummaries([
    { id: last, updatedAt: '2026-11-03T12:00:00Z', title: 'Página 3' },
    { id: 'legacy-art', title: 'Arte de Natal' },
    { id: first, updatedAt: '2026-11-03T10:00:00Z', title: 'Página 1' },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].pages.map((page) => page.id), [first, last]);
  assert.equal(groups[0].updatedAt, '2026-11-03T12:00:00Z');
});
