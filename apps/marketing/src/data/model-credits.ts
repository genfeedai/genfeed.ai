/** The anchor of a model's entry on the /models catalog page. */
export function modelAnchorId(key: string): string {
  return `model-${key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

/** Where a "Made with <model>" credit links: the model's catalog entry. */
export function modelCatalogHref(key: string): string {
  return `/models#${modelAnchorId(key)}`;
}

/**
 * Labels for the models that made the given media, keyed by model key. Only
 * models the public catalog lists get a credit: an unlisted or retired key
 * has nowhere to link.
 */
export function buildModelCredits(
  catalog: readonly { key: string; label: string }[] | null,
  media: readonly { model?: string | null }[],
): Record<string, string> {
  const used = new Set(
    media.flatMap((item) => (item.model ? [item.model] : [])),
  );
  return Object.fromEntries(
    (catalog ?? [])
      .filter((model) => used.has(model.key))
      .map((model) => [model.key, model.label]),
  );
}
