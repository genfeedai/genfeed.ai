import { MAX_MEDIA_VIEW_BATCH } from '@genfeedai/contracts/constants';
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

async function postMediaViews(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, number>> {
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
 * Counts the public images and videos a gallery visitor saw and answers their
 * counts by id. The API counts at most `MAX_MEDIA_VIEW_BATCH` ids a request,
 * so more are sent in several requests. A batch that fails answers nothing
 * and leaves the others counted.
 */
export async function trackPublicMediaViews(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const batches: (readonly string[])[] = [];
  for (let start = 0; start < ids.length; start += MAX_MEDIA_VIEW_BATCH) {
    batches.push(ids.slice(start, start + MAX_MEDIA_VIEW_BATCH));
  }
  const counts = await Promise.all(
    batches.map((batch) =>
      postMediaViews(batch, signal).catch((): Record<string, number> => ({})),
    ),
  );
  return Object.assign({}, ...counts);
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
