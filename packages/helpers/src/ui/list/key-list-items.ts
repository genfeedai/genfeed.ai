/** Stable content identities for lists without IDs, including repeated values. */
export function keyListItems<T>(
  items: readonly T[],
  getIdentity: (item: T) => string,
) {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const identity = getIdentity(item);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { item, key: JSON.stringify([identity, occurrence]) };
  });
}
