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
