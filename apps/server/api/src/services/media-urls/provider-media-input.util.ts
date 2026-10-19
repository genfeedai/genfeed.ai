import {
  classifyInternalMediaUrl,
  internalMediaHosts,
} from '@api/helpers/utils/reference/internal-media-url.util';

/**
 * Last-mile authorization of the media URLs inside a provider request.
 *
 * Prepared provider inputs are hashed and compared between quote and dispatch,
 * so they carry the stable canonical media URL (`/<category>/<ingredientId>`).
 * A signed grant changes with its expiry and would break that comparison, so
 * the grant is minted here, immediately before the provider call, from the
 * ingredient id the canonical URL names.
 */
export interface ProviderMediaAuthorizer {
  /** Origins whose URLs name internal media (CDN, ingredients endpoint, API). */
  origins: ReadonlyArray<string | undefined>;
  /** Mints a URL per ingredient id; rejects when any id is not usable. */
  issue(ingredientIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

function isThumbnailPath(value: string): boolean {
  try {
    const path = decodeURIComponent(
      decodeURIComponent(new URL(value, 'https://internal.invalid').pathname),
    );
    return path
      .split('/')
      .some((segment) => segment.toLowerCase() === 'thumbnails');
  } catch {
    return true;
  }
}

function internalIngredientId(
  value: string,
  hosts: ReadonlySet<string>,
): string | undefined {
  // Only absolute URLs reach a provider; free text such as a prompt is never one.
  if (!/^https?:\/\//i.test(value.trim())) return undefined;
  const classification = classifyInternalMediaUrl(value, hosts);
  if (!classification.isInternal) return undefined;
  // A thumbnail has no stored key, and an internal URL naming no asset is
  // never passed through unsigned.
  if (!classification.assetId || isThumbnailPath(value)) {
    throw new Error('Internal media URL has no authorized equivalent');
  }
  return classification.assetId;
}

function collect(
  value: unknown,
  hosts: ReadonlySet<string>,
  ids: Set<string>,
): void {
  if (typeof value === 'string') {
    const id = internalIngredientId(value, hosts);
    if (id) ids.add(id);
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item, hosts, ids);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collect(item, hosts, ids);
  }
}

function replace(
  value: unknown,
  hosts: ReadonlySet<string>,
  urls: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === 'string') {
    const id = internalIngredientId(value, hosts);
    return id ? urls.get(id) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replace(item, hosts, urls));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replace(item, hosts, urls),
      ]),
    );
  }
  return value;
}

/**
 * Returns a copy of `input` whose internal media URLs are authorized grants.
 * External URLs and non-URL values are unchanged. An internal URL that cannot
 * be resolved throws, so no unsigned internal URL reaches a provider.
 */
export async function authorizeProviderMediaInput<T>(
  input: T,
  authorizer: ProviderMediaAuthorizer,
): Promise<T> {
  const hosts = internalMediaHosts(authorizer.origins);
  const ids = new Set<string>();
  collect(input, hosts, ids);
  if (ids.size === 0) return input;
  const urls = await authorizer.issue([...ids]);
  for (const id of ids) {
    if (!urls.get(id)) throw new Error('Internal media URL was not authorized');
  }
  return replace(input, hosts, urls) as T;
}
