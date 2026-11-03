// The existing lightweight library RPC includes ids but not custom metadata.
// Namespaced page ids expose grouping without fetching every embedded image.
export function publicationId(groupId, pageIndex) {
  if (typeof groupId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(groupId) ||
      !Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > 999)
    throw Error('Identificação da página do encarte inválida.');
  const value = `encarte_${groupId}_${pageIndex}`;
  if (value.length > 100) throw Error('Identificação da página do encarte inválida.');
  return value;
}

export function publicationFromId(value) {
  if (typeof value !== 'string' || value.length > 100) return null;
  const match = /^encarte_([a-zA-Z0-9_-]+)_(0|[1-9][0-9]{0,2})$/.exec(value);
  return match ? { groupId: match[1], pageIndex: Number(match[2]) } : null;
}

export function groupPublicationSummaries(rows) {
  const groups = new Map();
  for (const row of rows) {
    const identity = publicationFromId(row.id);
    if (!identity) continue;
    let group = groups.get(identity.groupId);
    if (!group) {
      group = { groupId: identity.groupId, pages: [], updatedAt: row.updatedAt || '' };
      groups.set(identity.groupId, group);
    }
    group.pages.push({ ...row, pageIndex: identity.pageIndex });
    if ((row.updatedAt || '') > group.updatedAt) group.updatedAt = row.updatedAt;
  }
  for (const group of groups.values()) group.pages.sort((a, b) => a.pageIndex - b.pageIndex);
  return [...groups.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
