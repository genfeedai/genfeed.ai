interface Identifiable {
  id: string;
}

interface Sourced {
  source: string;
}

interface Targeted {
  target: string;
}

function createGroupedMap<T>(
  items: readonly T[],
  getKey: (item: T) => string,
): ReadonlyMap<string, T[]> {
  const groupedMap = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const existingItems = groupedMap.get(key);
    if (existingItems) {
      existingItems.push(item);
      continue;
    }

    groupedMap.set(key, [item]);
  }

  return groupedMap;
}

export function createIdMap<T extends Identifiable>(
  items: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export function createSourceMap<T extends Sourced>(
  items: readonly T[],
): ReadonlyMap<string, T[]> {
  return createGroupedMap(items, (item) => item.source);
}

export function createTargetMap<T extends Targeted>(
  items: readonly T[],
): ReadonlyMap<string, T[]> {
  return createGroupedMap(items, (item) => item.target);
}
