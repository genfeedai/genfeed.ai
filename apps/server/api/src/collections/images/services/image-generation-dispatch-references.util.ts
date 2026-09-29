/**
 * Brief compilers write each reference's ingredient/asset id into the provider
 * dispatch (`image_input`, `input_images`, `image`, ...). Providers need public
 * URLs, so swap every known reference id for its resolved URL. Only exact id
 * matches on top-level string or string-array fields are replaced, which keeps
 * this independent of each model's field names.
 */
export function replaceDispatchReferenceIds(
  dispatch: Record<string, unknown>,
  urlByReferenceId: ReadonlyMap<string, string>,
): Record<string, unknown> {
  if (urlByReferenceId.size === 0) {
    return dispatch;
  }

  const replaced: Record<string, unknown> = { ...dispatch };
  for (const [field, value] of Object.entries(dispatch)) {
    if (typeof value === 'string') {
      const url = urlByReferenceId.get(value);
      if (url) {
        replaced[field] = url;
      }
      continue;
    }

    if (
      Array.isArray(value) &&
      value.some((entry) => typeof entry === 'string')
    ) {
      replaced[field] = value.map((entry) =>
        typeof entry === 'string'
          ? (urlByReferenceId.get(entry) ?? entry)
          : entry,
      );
    }
  }

  return replaced;
}
