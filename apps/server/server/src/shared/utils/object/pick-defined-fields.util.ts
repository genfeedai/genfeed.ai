export function pickDefinedFields<
  TSource extends object,
  const TKey extends keyof TSource & string,
>(source: TSource, keys: readonly TKey[]): Pick<TSource, TKey> {
  return Object.fromEntries(
    keys.flatMap((key) =>
      source[key] === undefined ? [] : [[key, source[key]]],
    ),
  ) as Pick<TSource, TKey>;
}
