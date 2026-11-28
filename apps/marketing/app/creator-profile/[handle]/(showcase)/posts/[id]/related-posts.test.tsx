import type { Post } from '@models/content/post.model';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicPostsPage = vi.hoisted(() => vi.fn());

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({ findPublicPostsPage }) },
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

function onePage(items: Post[]): { hasNext: boolean; items: Post[] } {
  return { hasNext: false, items };
}

describe('RelatedPosts', () => {
  beforeEach(() => {
    findPublicPostsPage.mockReset();
  });

  it('links to the three posts that follow, wrapping at the end', async () => {
    findPublicPostsPage.mockResolvedValue(onePage(posts(5)));

    expect(await relatedHrefs('post-3')).toEqual([
      '/@shayla/posts/post-4',
      '/@shayla/posts/post-0',
      '/@shayla/posts/post-1',
    ]);
  });

  it('walks every post of the creator, whichever platform it went out on', async () => {
    findPublicPostsPage.mockResolvedValue(onePage(posts(2)));

    await relatedHrefs('post-0');

    expect(findPublicPostsPage).toHaveBeenCalledWith({
      brand: 'brand-post-0',
      limit: 100,
      page: 1,
    });
  });

  it('links a post that sits past the first page', async () => {
    findPublicPostsPage
      .mockResolvedValueOnce({ hasNext: true, items: posts(2) })
      .mockResolvedValueOnce({
        hasNext: false,
        items: [
          { description: 'late', id: 'late-1', label: 'Late 1' } as Post,
          { description: 'late', id: 'late-2', label: 'Late 2' } as Post,
        ],
      });

    expect(await relatedHrefs('late-1')).toEqual([
      '/@shayla/posts/late-2',
      '/@shayla/posts/post-0',
      '/@shayla/posts/post-1',
    ]);
  });

  it('links to nothing when the list fails or the post is not in it', async () => {
    findPublicPostsPage.mockRejectedValue(new Error('API down'));
    expect(await relatedHrefs('post-0')).toEqual([]);

    findPublicPostsPage.mockResolvedValue(onePage(posts(4)));
    expect(await relatedHrefs('not-listed')).toEqual([]);
  });
});
