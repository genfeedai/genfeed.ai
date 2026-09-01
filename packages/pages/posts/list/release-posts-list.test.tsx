import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ReleasePostsList', () => {
  const source = readFileSync(
    join(process.cwd(), 'posts/list/release-posts-list.tsx'),
    'utf8',
  );

  it('reads only the canonical release list service', () => {
    expect(source).toContain('ReleaseGroupsService');
    expect(source).toContain('findAllPage');
    expect(source).not.toContain('PostsService');
    expect(source).not.toContain('findBrandPostsPage');
  });

  it('renders target lifecycle and links to the canonical editor', () => {
    expect(source).toContain('target.executionState');
    expect(source).toContain('getPublishingPostHref(target.id)');
  });

  it('offers a target-specific variation action beside published navigation', () => {
    expect(source).toContain('buildSourcePostVariationsHref');
    expect(source).toContain('postId: target.id');
    expect(source).toContain('target.executionState === TargetState.PUBLISHED');
    expect(source).toContain('generateVariationsAria');
  });

  it('streams without required initial data and keeps loading inside the data region', () => {
    expect(source).toContain('initialPagination?: ReleaseListPagination');
    expect(source).toContain('initialReleases?: IReleaseGroup[]');
    expect(source).toContain('isLoading && data.releases.length === 0');
  });

  it('resolves user-visible copy through the host pages catalog', () => {
    expect(source).toContain("useTranslations('pages.posts.list')");
    expect(source).not.toContain('const POSTS_LOAD_ERROR');
    expect(source).not.toContain('function viewCopy');
  });
});
