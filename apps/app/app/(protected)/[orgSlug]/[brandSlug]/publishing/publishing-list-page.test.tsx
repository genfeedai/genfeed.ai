import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('publishing-list-page', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'app/(protected)/[orgSlug]/[brandSlug]/publishing/publishing-list-page.tsx',
    ),
    'utf8',
  );

  it('streams canonical Publishing queries through the release list only', () => {
    expect(source).toContain('ServerQueryHydrationBoundary');
    expect(source).toContain('loadProtectedBootstrap');
    expect(source).toContain('prefetchServerQuery');
    expect(source).toContain('buildReleasePostsListQueryKey');
    expect(source).toContain('normalizeReleasePostContentTypes');
    expect(source).toContain('contentTypes={contentTypes}');
    expect(source).toContain('ReleasePostsList');
    expect(source).not.toContain('const initialData = await');
    expect(source).not.toContain('PageScope.SUPERADMIN');
    expect(source).not.toContain('buildPostsListQueryKey');
    expect(source).not.toContain('PublishingPostsList');
    expect(source).not.toContain('loadPostsPageData');
  });

  it('maps pending and processing statuses onto the publishing execution state', () => {
    expect(source).toContain(
      'normalizedStatus === PostStatus.PENDING || normalizedStatus === PostStatus.PROCESSING',
    );
    expect(source).toContain('TargetExecutionState.PUBLISHING');
  });
});
