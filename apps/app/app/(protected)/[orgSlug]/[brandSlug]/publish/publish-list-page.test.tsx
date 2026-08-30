import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('publish-list-page', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'app/(protected)/[orgSlug]/[brandSlug]/publish/publish-list-page.tsx',
    ),
    'utf8',
  );

  it('streams canonical release queries for Publish routes and retains the admin compatibility list', () => {
    expect(source).toContain('ServerQueryHydrationBoundary');
    expect(source).toContain('prefetchServerQuery');
    expect(source).toContain('buildReleasePostsListQueryKey');
    expect(source).toContain('normalizeReleasePostContentTypes');
    expect(source).toContain('contentTypes={contentTypes}');
    expect(source).toContain('ReleasePostsList');
    expect(source).toContain('buildPostsListQueryKey');
    expect(source).toContain('PublishPostsList');
  });

  it('never awaits the prefetch, so the shell streams before the list data resolves', () => {
    expect(source).not.toContain('await prefetchServerQuery');
    expect(source).toContain('prefetchServerQuery({');
    // The loaders only run inside the streamed queryFn, never at page level.
    expect(source).toMatch(/queryFn: async \(\) => \{\s+const pageData =/);
  });

  it('lets the lists hydrate from the streamed cache instead of initial-data props', () => {
    expect(source).not.toContain('initialReleases=');
    expect(source).not.toContain('initialPagination=');
    expect(source).not.toContain('initialPosts=');
    expect(source).not.toContain('initialPostPresets=');
  });
});
