import { listRecords, listResourcePage, command, subscribeResource, getDataContext, getRecord } from '../shared/data/api.js';

const defaultDriver = { listRecords, listResourcePage, command, subscribeResource, getDataContext, getRecord };
const clone = (value) => structuredClone(value);

/** RPC snapshots and viewed versions are isolated from drafts owned by screens. */
export function createOperationalStore(resource, driver = defaultDriver, { realtime = true } = {}) {
  let rows = [],
    scope = '',
    generation = 0,
    revision = 0;
  let unsubscribe = null,
    loading = null,
    mutationGate = null;
  let tail = Promise.resolve();
  const viewedVersions = new Map();

  function clear() {
    generation++;
    revision++;
    rows = [];
    viewedVersions.clear();
    loading = null;
    mutationGate = null;
    tail = Promise.resolve();
    unsubscribe?.();
    unsubscribe = null;
  }

  function context() {
    const current = driver.getDataContext();
    const key = `${current?.companyId || ''}:${current?.userId || current?.user?.id || ''}`;
    if (key !== scope) {
      clear();
      scope = key;
    }
    return `${scope}:${generation}`;
  }

  function remember(value) {
    if (Array.isArray(value)) {
      for (const record of value) remember(record);
      return value;
    }
    const record = value?.record || value;
    if (record?.id) {
      revision++;
      viewedVersions.set(record.id, record._version);
      const index = rows.findIndex((row) => row.id === record.id);
      if (index < 0) rows.unshift(clone(record));
      else rows[index] = clone(record);
    }
    return value;
  }

  async function load() {
    const expected = context();
    if (mutationGate) {
      await mutationGate;
      if (expected !== context()) throw Error('A sessão ou empresa ativa mudou durante a leitura.');
      return load();
    }
    if (!loading) {
      const expectedRevision = revision;
      const pending = driver
        .listRecords(resource)
        .then((result) => {
          if (expected !== context()) throw Error('A sessão ou empresa ativa mudou durante a leitura.');
          if (revision === expectedRevision) rows = clone(result);
          return clone(rows);
        })
        .finally(() => {
          if (loading === pending) loading = null;
        });
      loading = pending;
    }
    if (realtime && !unsubscribe) {
      unsubscribe = driver.subscribeResource(resource, () => {
        if (!driver.getDataContext()) {
          scope = '';
          clear();
          return;
        }
        void load().catch(() => {});
      });
    }
    return loading;
  }

  return {
    load,
    viewPage(items) {
      context();
      for (const item of items) if (item?.id && Number.isSafeInteger(item._version))
        viewedVersions.set(item.id, item._version);
    },
    async loadPage(filters = {}) {
      const expected = context();
      const result = await driver.listResourcePage(resource, filters);
      if (expected !== context()) throw Error('A sessão ou empresa ativa mudou durante a leitura.');
      // Card projections never replace complete documents used by editors.
      // Each editing entry must loadRecord before reading its viewed version.
      return clone(result);
    },
    async loadRecord(id) {
      const expected = context();
      const record = await driver.getRecord(resource, id);
      if (expected !== context()) throw Error('A sessão ou empresa ativa mudou durante a leitura.');
      if (record) remember(record);
      else {
        rows = rows.filter((row) => row.id !== id);
        viewedVersions.delete(id);
      }
      return clone(record);
    },
    accept(record) {
      context();
      remember(record);
      return clone(record);
    },
    remove(id) {
      context();
      revision++;
      rows = rows.filter((row) => row.id !== id);
      viewedVersions.delete(id);
    },
    list() {
      context();
      for (const row of rows) viewedVersions.set(row.id, row._version);
      return clone(rows);
    },
    get(id) {
      context();
      const record = rows.find((row) => row.id === id);
      if (!record) throw Error('Registro não encontrado. Atualize a lista.');
      viewedVersions.set(record.id, record._version);
      return clone(record);
    },
    async run(action, id, payload = {}) {
      const expectedScope = context(),
        snapshot = clone(payload);
      const execute = async () => {
        if (expectedScope !== context()) throw Error('A empresa ativa mudou. Abra o registro novamente.');
        const expectedVersion = viewedVersions.get(id) ?? rows.find((row) => row.id === id)?._version;
        if (Array.isArray(snapshot.keys)) {
          snapshot.expectedVersions = Object.fromEntries(
            snapshot.keys.map((key) => [key, viewedVersions.get(key) ?? rows.find((row) => row.id === key)?._version]),
          );
        }
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        mutationGate = gate;
        let result;
        try {
          result = await driver.command(resource, action, id, snapshot, { expectedVersion });
          if (expectedScope !== context()) throw Error('A empresa ativa mudou durante a operação.');
          remember(result);
        } finally {
          if (mutationGate === gate) mutationGate = null;
          release();
        }
        if (!result?.id && !result?.record?.id && !Array.isArray(result)) await load();
        return clone(result);
      };
      const result = tail.then(execute, execute);
      tail = result.catch(() => {});
      return result;
    },
    reset() {
      scope = '';
      clear();
    },
  };
}
