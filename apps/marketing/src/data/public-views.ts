import { EnvironmentService } from '@services/core/environment.service';

export type PublicViewTarget = 'article' | 'profile';

const PUBLIC_VIEW_COLLECTIONS: Record<PublicViewTarget, string> = {
  article: 'articles',
  profile: 'brands',
};

/**
 * Counts a visit to a public profile or article and answers its view count,
 * or null when the page is not public or the call fails. Plain `fetch` keeps
 * the browser bundle free of the API client and its models.
 */
export async function trackPublicView(
  target: PublicViewTarget,
  id: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const response = await fetch(
    `${EnvironmentService.apiEndpoint}/public/${PUBLIC_VIEW_COLLECTIONS[target]}/${encodeURIComponent(id)}/views`,
    { method: 'POST', signal },
  );
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as {
    data?: { views?: unknown } | null;
  };
  const views = body.data?.views;
  return typeof views === 'number' ? views : null;
}

/**
 * Counts the public images and videos a gallery visitor saw, in one request,
 * and answers their counts by id. A failed call answers nothing.
 */
export async function trackPublicMediaViews(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  if (ids.length === 0) {
    return {};
  }
  const response = await fetch(
    `${EnvironmentService.apiEndpoint}/public/media/views`,
    {
      body: JSON.stringify({ ids }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal,
    },
  );
  if (!response.ok) {
    return {};
  }
  const body = (await response.json()) as {
    data?: { views?: Record<string, unknown> } | null;
  };
  return Object.fromEntries(
    Object.entries(body.data?.views ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

/**
 * Counts a click on Recreate in Genfeed. The page is about to leave for the
 * app, so the request is sent to outlive it, and a failure is ignored.
 */
export function trackRecreation(id: string): void {
  void fetch(
    `${EnvironmentService.apiEndpoint}/public/media/${encodeURIComponent(id)}/recreations`,
    { keepalive: true, method: 'POST' },
  ).catch(() => undefined);
}
