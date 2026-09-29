/**
 * Brief compilers write each reference's ingredient/asset id into the provider
 * dispatch (`image_input`, `input_images`, `image`, ...). Providers need public
 * URLs, so swap every resolved reference id for its URL and drop the ids that
 * did not resolve (foreign, deleted, or missing), so an id never reaches the
 * provider. Only exact id matches on top-level string or string-array fields
 * are touched, which keeps this independent of each model's field names.
 */
export function replaceDispatchReferenceIds(
  dispatch: Record<string, unknown>,
  urlByReferenceId: ReadonlyMap<string, string>,
  unresolvedReferenceIds: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  if (urlByReferenceId.size === 0 && unresolvedReferenceIds.size === 0) {
    return dispatch;
  }

  const replaced: Record<string, unknown> = { ...dispatch };
  for (const [field, value] of Object.entries(dispatch)) {
    if (typeof value === 'string') {
      const url = urlByReferenceId.get(value);
      if (url) {
        replaced[field] = url;
      } else if (unresolvedReferenceIds.has(value)) {
        delete replaced[field];
      }
      continue;
    }

    if (
      Array.isArray(value) &&
      value.some((entry) => typeof entry === 'string')
    ) {
      const entries = value
        .filter(
          (entry) =>
            typeof entry !== 'string' || !unresolvedReferenceIds.has(entry),
        )
        .map((entry) =>
          typeof entry === 'string'
            ? (urlByReferenceId.get(entry) ?? entry)
            : entry,
        );
      if (entries.length > 0) {
        replaced[field] = entries;
      } else {
        delete replaced[field];
      }
    }
  }

  return replaced;
}
