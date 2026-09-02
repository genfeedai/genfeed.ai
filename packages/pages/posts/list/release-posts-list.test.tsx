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

  it('renders the rail row component instead of inline per-target JSX', () => {
    expect(source).toContain('ReleaseRailRow');
    expect(source).toContain('browserTimezone={browserTimezone}');
    expect(source).not.toContain('target.executionState');
    expect(source).not.toContain('buildSourcePostVariationsHref');
  });

  it('wires the rail segments control into the filters toolbar', () => {
    expect(source).toContain('ReleaseRailSegments');
    expect(source).toContain('deriveRailSegment');
    expect(source).toContain('applyRailSegment');
    expect(source).toContain('viewNode=');
  });

  it('wires account chips filtering by credentialIds', () => {
    expect(source).toContain('ReleaseRailAccounts');
    expect(source).toContain('credentialIds');
    expect(source).toContain('handleAccountToggle');
    expect(source).toContain('PUBLISHING_POSTS_QUERY_KEYS.ACCOUNT');
  });

  it('wires keyboard navigation across the rail rows', () => {
    expect(source).toContain('useRailKeys');
    expect(source).toContain('registerItem');
    expect(source).toContain('activeIndex');
    expect(source).toContain('onOpen');
    expect(source).toContain('onRefresh');
  });

  it('streams without required initial data and keeps loading inside the data region', () => {
    expect(source).toContain('initialPagination?: ReleaseListPagination');
    expect(source).toContain('initialReleases?: IReleaseGroup[]');
    expect(source).toContain('isLoading && data.releases.length === 0');
  });

  it('resolves user-visible copy through the host pages catalog', () => {
    expect(source).toContain("useTranslations('pages.posts.list')");
    expect(source).toContain("useTranslations('pages.posts.list.rail')");
    expect(source).not.toContain('const POSTS_LOAD_ERROR');
    expect(source).not.toContain('function viewCopy');
  });
});
