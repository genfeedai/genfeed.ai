import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('publish-list-page', () => {
  it('hydrates the posts list query cache for hot posts routes', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/publish/publish-list-page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('ServerQueryHydrationBoundary');
    expect(source).toContain('prefetchServerQuery');
    expect(source).toContain('buildPostsListQueryKey');
    expect(source).toContain('initialData.posts');
  });
});
