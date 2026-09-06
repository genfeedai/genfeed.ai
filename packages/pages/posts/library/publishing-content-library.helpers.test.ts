import { ArticleCategory, Platform, PostStatus } from '@genfeedai/contracts';
import type { IPost, IReleaseGroup } from '@genfeedai/contracts/interfaces';
import type { Article } from '@models/content/article.model';
import type { Newsletter } from '@models/content/newsletter.model';
import {
  createPublishingContentLibraryItems,
  filterPublishingContentLibraryItems,
} from '@pages/posts/library/publishing-content-library.helpers';
import { describe, expect, it } from 'vitest';

const collections = {
  articles: [
    {
      category: ArticleCategory.TUTORIAL,
      createdAt: '2026-08-07T10:00:00.000Z',
      id: 'article-1',
      label: 'Launch guide',
      status: 'PUBLISHED',
      summary: 'A long-form launch plan',
    } as Article,
    {
      category: ArticleCategory.X_ARTICLE,
      createdAt: '2026-08-04T10:00:00.000Z',
      id: 'article-2',
      label: 'X field notes',
      status: 'DRAFT',
      summary: 'A long post for X',
    } as Article,
  ],
  newsletters: [
    {
      createdAt: '2026-08-06T10:00:00.000Z',
      id: 'newsletter-1',
      label: 'Founder weekly',
      status: 'ready_for_review',
      summary: 'This week in operations',
      topic: 'Operations',
    } as Newsletter,
  ],
  posts: [
    {
      createdAt: '2026-08-08T10:00:00.000Z',
      description: '<p>Social launch copy</p>',
      id: 'post-1',
      platform: Platform.INSTAGRAM,
      status: PostStatus.SCHEDULED,
    } as IPost,
  ],
};

describe('publishing content library federation', () => {
  it('normalizes all three canonical content types and sorts them newest first', () => {
    const items = createPublishingContentLibraryItems(collections);

    expect(
      items.map(({ channel, id, status, type }) => ({
        channel,
        id,
        status,
        type,
      })),
    ).toEqual([
      {
        channel: Platform.INSTAGRAM,
        id: 'post-1',
        status: PostStatus.SCHEDULED,
        type: 'post',
      },
      {
        channel: 'web',
        id: 'article-1',
        status: 'published',
        type: 'article',
      },
      {
        channel: 'email',
        id: 'newsletter-1',
        status: 'ready_for_review',
        type: 'newsletter',
      },
      {
        channel: Platform.TWITTER,
        id: 'article-2',
        status: 'draft',
        type: 'article',
      },
    ]);
  });

  it('merges publishing jobs without duplicating their post targets and keeps empty drafts', () => {
    const releases = [
      {
        id: 'group-1',
        title: 'Scheduled launch',
        createdAt: '2026-08-09T10:00:00Z',
        status: 'scheduled',
        targets: [{ id: 'post-1', platform: Platform.INSTAGRAM }],
      },
      {
        id: 'group-2',
        title: 'New draft',
        createdAt: '2026-08-10T10:00:00Z',
        status: 'draft',
        targets: [],
      },
    ] as unknown as IReleaseGroup[];
    const items = createPublishingContentLibraryItems({
      ...collections,
      releases,
    });
    expect(items.map((item) => item.id)).not.toContain('post-1');
    expect(
      items.filter((item) => item.type === 'post').map((item) => item.id),
    ).toEqual(['group-2', 'group-1']);
  });

  it('normalizes public posts to the same published status used by articles', () => {
    const items = createPublishingContentLibraryItems({
      ...collections,
      posts: [{ ...collections.posts[0], status: PostStatus.PUBLIC }],
    });
    expect(
      filterPublishingContentLibraryItems(items, {
        channel: 'all',
        search: '',
        type: 'all',
        status: ['published'],
      }),
    ).toHaveLength(2);
  });

  it('applies type, channel, lifecycle, and search filters together', () => {
    const items = createPublishingContentLibraryItems(collections);

    expect(
      filterPublishingContentLibraryItems(items, {
        channel: 'web',
        search: 'launch',
        status: 'published',
        type: 'article',
      }).map((item) => item.id),
    ).toEqual(['article-1']);

    expect(
      filterPublishingContentLibraryItems(items, {
        channel: 'email',
        search: 'instagram',
        status: 'ready_for_review',
        type: 'newsletter',
      }),
    ).toEqual([]);
  });
});
