import type { PublishedRelease } from '@genfeedai/contracts/interfaces/system/app-build.interface';

const RELEASES_API =
  'https://api.github.com/repos/genfeedai/genfeed.ai/releases';

export async function getPublishedReleases(): Promise<PublishedRelease[]> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const releases: PublishedRelease[] = [];
  let page = 1;
  while (true) {
    const response = await fetch(`${RELEASES_API}?per_page=100&page=${page}`, {
      headers,
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`GitHub releases fetch failed: ${response.status}`);
    const values: unknown = await response.json();
    if (!Array.isArray(values))
      throw new Error('Invalid GitHub releases response');
    const entries: unknown[] = values;
    for (const value of entries) {
      if (typeof value !== 'object' || value === null)
        throw new Error('Invalid GitHub release');
      if (
        !('draft' in value) ||
        !('prerelease' in value) ||
        !('published_at' in value)
      )
        throw new Error('Invalid GitHub release');
      if (value.draft || value.prerelease || !value.published_at) continue;
      if (
        !('tag_name' in value) ||
        typeof value.tag_name !== 'string' ||
        typeof value.published_at !== 'string' ||
        !Number.isFinite(Date.parse(value.published_at)) ||
        !('body' in value) ||
        (value.body !== null && typeof value.body !== 'string')
      ) {
        throw new Error('Invalid published GitHub release');
      }
      releases.push({
        body: value.body ?? '',
        publishedAt: value.published_at,
        tag: value.tag_name,
        url: `https://github.com/genfeedai/genfeed.ai/releases/tag/${encodeURIComponent(value.tag_name)}`,
      });
    }
    if (!response.headers.get('link')?.includes('rel="next"')) break;
    page += 1;
  }
  return releases.sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}
