import type { Post } from '@models/content/post.model';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicPosts = vi.hoisted(() => vi.fn());

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({ findPublicPosts }) },
}));

import RelatedPosts from './related-posts';

function posts(count: number): Post[] {
  return Array.from(
    { length: count },
    (_, index) =>
      ({
        description: `Post number ${index}`,
        id: `post-${index}`,
        label: `Post ${index}`,
      }) as Post,
  );
}

async function relatedHrefs(postId: string): Promise<string[]> {
  const element = (await RelatedPosts({
    brandId: `brand-${postId}`,
    handle: 'shayla',
    postId,
  })) as ReactElement<{ links: { href: string }[] }>;
  return element.props.links.map((link) => link.href);
}

describe('RelatedPosts', () => {
  beforeEach(() => {
    findPublicPosts.mockReset();
  });

  it('links to the three posts that follow, wrapping at the end', async () => {
    findPublicPosts.mockResolvedValue(posts(5));

    expect(await relatedHrefs('post-3')).toEqual([
      '/@shayla/posts/post-4',
      '/@shayla/posts/post-0',
      '/@shayla/posts/post-1',
    ]);
  });

  it('walks every post of the creator, whichever platform it went out on', async () => {
    findPublicPosts.mockResolvedValue(posts(2));

    await relatedHrefs('post-0');

    expect(findPublicPosts).toHaveBeenCalledWith({
      brand: 'brand-post-0',
      limit: 100,
    });
  });

  it('links to nothing when the list fails or the post is not in it', async () => {
    findPublicPosts.mockRejectedValue(new Error('API down'));
    expect(await relatedHrefs('post-0')).toEqual([]);

    findPublicPosts.mockResolvedValue(posts(4));
    expect(await relatedHrefs('not-listed')).toEqual([]);
  });
});
