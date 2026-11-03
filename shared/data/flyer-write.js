// Transport optimization only: the canonical document still contains every image.
// References are resolved by the RPC against the same document and revision.
export function isUncertainFlyerSave(error) {
  return !error?.code && /AbortError|TimeoutError|FetchError|Failed to fetch|fetch failed|Load failed|NetworkError/i.test(error?.message ?? '');
}

const equal = (left, right) => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right))
    return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
};
const content = (record) => Object.fromEntries(Object.entries(record).filter(([key]) =>
  !['_version', 'createdAt', 'updatedAt'].includes(key)));

export function confirmsFlyerWrite(record, stored, expectedVersion) {
  return stored?.id === record.id && stored._version === (expectedVersion ?? 0) + 1 && equal(content(record), content(stored));
}

export function compactFlyerWrite(record, previous, expectedVersion) {
  if (!previous || previous.id !== record.id || previous._version !== expectedVersion || expectedVersion == null)
    return { record, imageRefs: [] };
  const sources = new Map();
  previous.elements?.forEach((element, source) => {
    for (const sourceField of ['src', 'image']) {
      const value = element[sourceField];
      if (typeof value === 'string' && value.startsWith('data:image/'))
        sources.set(value, { source, sourceField });
    }
  });
  const imageRefs = [];
  const elements = record.elements.map((element, target) => {
    const next = { ...element };
    for (const field of ['src', 'image']) {
      const match = sources.get(element[field]);
      if (match) {
        imageRefs.push({ target, field, ...match });
        delete next[field];
      }
    }
    return next;
  });
  return { record: { ...record, elements }, imageRefs };
}
