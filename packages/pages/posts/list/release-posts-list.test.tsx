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

  it('renders target lifecycle and preserves the filtered return URL', () => {
    expect(source).toContain('target.executionState');
    expect(source).toContain('withArtifactEditorReturn');
    expect(source).toContain('getPublisherPostHref(target.id)');
    expect(source).toContain('returnUrl');
  });
});
