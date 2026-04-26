interface Identifiable {
  id: string;
}

interface GroupLike {
  nodeIds: string[];
}

export function createIdLookup(ids: readonly string[]): ReadonlySet<string> {
  return new Set(ids);
}

export function filterItemsByIdLookup<T extends Identifiable>(
  items: readonly T[],
  idLookup: ReadonlySet<string>,
): T[] {
  if (idLookup.size === 0) {
    return [];
  }

  return items.filter((item) => idLookup.has(item.id));
}

export function hasEveryId(
  ids: readonly string[],
  idLookup: ReadonlySet<string>,
): boolean {
  for (const id of ids) {
    if (!idLookup.has(id)) {
      return false;
    }
  }

  return true;
}

export function hasSomeId(
  ids: readonly string[],
  idLookup: ReadonlySet<string>,
): boolean {
  for (const id of ids) {
    if (idLookup.has(id)) {
      return true;
    }
  }

  return false;
}

export function mergeIds(
  existingIds: readonly string[],
  idsToAdd: readonly string[],
): string[] {
  if (idsToAdd.length === 0) {
    return [...existingIds];
  }

  const mergedIds = [...existingIds];
  const idLookup = new Set(existingIds);

  for (const id of idsToAdd) {
    if (!idLookup.has(id)) {
      mergedIds.push(id);
      idLookup.add(id);
    }
  }

  return mergedIds;
}

export function removeIds(
  ids: readonly string[],
  idsToRemove: readonly string[],
): string[] {
  if (ids.length === 0 || idsToRemove.length === 0) {
    return [...ids];
  }

  const removalLookup = createIdLookup(idsToRemove);
  return ids.filter((id) => !removalLookup.has(id));
}

export function findGroupContainingNodeId<T extends GroupLike>(
  groups: readonly T[],
  nodeId: string,
): T | undefined {
  return groups.find((group) => group.nodeIds.includes(nodeId));
}
