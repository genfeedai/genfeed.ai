import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('publishing-list-page', () => {
  it('hydrates canonical release queries for Publishing routes and retains the admin compatibility list', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/publishing/publishing-list-page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('ServerQueryHydrationBoundary');
    expect(source).toContain('prefetchServerQuery');
    expect(source).toContain('buildReleasePostsListQueryKey');
    expect(source).toContain('normalizeReleasePostContentTypes');
    expect(source).toContain('contentTypes={contentTypes}');
    expect(source).toContain('initialData.releases');
    expect(source).toContain('ReleasePostsList');
    expect(source).toContain('buildPostsListQueryKey');
    expect(source).toContain('initialData.posts');
  });
});
