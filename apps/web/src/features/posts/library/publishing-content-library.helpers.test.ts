import {
  ArticleCategory,
  IngredientCategory,
  Platform,
  PostFormat,
  PostStatus,
} from '@genfeedai/contracts';
import type {
  ICredential,
  IPost,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type { Article } from '@models/content/article.model';
import type { Newsletter } from '@models/content/newsletter.model';
import { describe, expect, it } from 'vitest';
import {
  createPublishingBoardColumns,
  createPublishingContentLibraryItems,
  filterPublishingContentLibraryItems,
  formatPublishingContentFormat,
  hasPublishingInFlight,
  type PublishingContentLibraryItem,
} from '@/features/posts/library/publishing-content-library.helpers';

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

  it('strips stored HTML out of release titles', () => {
    const items = createPublishingContentLibraryItems({
      articles: [],
      newsletters: [],
      posts: [],
      releases: [
        {
          baseContent: '<p>AI content is taking over!</p>',
          createdAt: '2026-08-11T10:00:00Z',
          id: 'group-html',
          status: 'paused',
          title: '<p>AI content is taking over! Manual content...</p>',
        } as IReleaseGroup,
      ],
    });

    expect(items[0]?.title).toBe(
      'AI content is taking over! Manual content...',
    );
    expect(items[0]?.summary).toBe('AI content is taking over!');
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

  it('lists a TikTok Inbox delivery with the drafts and flags it, not as published', () => {
    const items = createPublishingContentLibraryItems({
      ...collections,
      articles: [],
      newsletters: [],
      posts: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          id: 'inbox-post',
          isInboxDelivery: true,
          platform: Platform.TIKTOK,
          status: PostStatus.PUBLIC,
        } as IPost,
        {
          createdAt: '2026-08-07T10:00:00.000Z',
          id: 'live-post',
          platform: Platform.TIKTOK,
          status: PostStatus.PUBLIC,
        } as IPost,
      ],
    });

    expect(
      items.map(({ id, isInboxDelivery, status }) => ({
        id,
        isInboxDelivery,
        status,
      })),
    ).toEqual([
      { id: 'inbox-post', isInboxDelivery: true, status: 'draft' },
      { id: 'live-post', isInboxDelivery: false, status: 'published' },
    ]);
  });

  it('flags a release whose every target is a TikTok Inbox delivery', () => {
    const release = (targets: Array<{ isInboxDelivery?: boolean }>) =>
      ({
        createdAt: '2026-08-09T10:00:00Z',
        id: 'group-inbox',
        status: 'draft',
        targets: targets.map((target, index) => ({
          id: `t${index}`,
          platform: Platform.TIKTOK,
          ...target,
        })),
        title: 'Inbox release',
      }) as unknown as IReleaseGroup;
    const flagOf = (releases: IReleaseGroup[]) =>
      createPublishingContentLibraryItems({
        articles: [],
        newsletters: [],
        posts: [],
        releases,
      })[0]?.isInboxDelivery;

    expect(flagOf([release([{ isInboxDelivery: true }])])).toBe(true);
    expect(
      flagOf([
        release([{ isInboxDelivery: true }, { isInboxDelivery: false }]),
      ]),
    ).toBe(false);
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

  it('filters by a connected account id', () => {
    const items = createPublishingContentLibraryItems(collections).map(
      (item, index) =>
        index === 0
          ? {
              ...item,
              accounts: [
                {
                  id: 'cred-1',
                  label: '@genfeedai',
                  platform: 'twitter',
                },
              ],
            }
          : item,
    );

    expect(
      filterPublishingContentLibraryItems(items, {
        channel: 'account:cred-1',
        search: '',
        status: [],
        type: 'all',
      }).map((item) => item.id),
    ).toEqual([items[0]?.id]);
  });

  it('tags only non-plain formats and leaves plain posts untagged', () => {
    const items = createPublishingContentLibraryItems({
      articles: collections.articles,
      newsletters: collections.newsletters,
      posts: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          description: 'Plain',
          format: PostFormat.STANDARD,
          id: 'plain',
          platform: Platform.TWITTER,
        },
        {
          createdAt: '2026-08-08T09:00:00.000Z',
          description: 'Thread',
          format: PostFormat.THREAD,
          id: 'thread',
          platform: Platform.TWITTER,
        },
        {
          createdAt: '2026-08-08T08:00:00.000Z',
          description: 'Long',
          format: PostFormat.LONG_FORM,
          id: 'long',
          platform: Platform.TWITTER,
        },
        {
          createdAt: '2026-08-08T07:00:00.000Z',
          description: 'Clip',
          id: 'clip',
          ingredients: [{ category: IngredientCategory.VIDEO }],
          platform: Platform.INSTAGRAM,
        },
      ] as unknown as IPost[],
    });
    const formats = Object.fromEntries(
      items.map((item) => [item.id, item.format]),
    );

    expect(formats).toMatchObject({
      'article-1': 'article',
      clip: 'video',
      long: 'long-post',
      'newsletter-1': 'newsletter',
      thread: 'thread',
    });
    expect(formats.plain).toBeUndefined();
    expect(formatPublishingContentFormat('long-post')).toBe('Long post');
  });

  it('carries the target account of a post for the avatar stack', () => {
    const items = createPublishingContentLibraryItems({
      articles: [],
      newsletters: [],
      posts: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          credential: {
            externalAvatar: 'https://cdn.example/avatar.png',
            externalHandle: 'acme',
            id: 'cred-1',
            platform: Platform.TWITTER,
          },
          description: 'Hello',
          id: 'post-1',
          platform: Platform.TWITTER,
        },
      ] as unknown as IPost[],
    });

    expect(items[0]?.accounts).toEqual([
      {
        avatarUrl: 'https://cdn.example/avatar.png',
        handle: 'acme',
        id: 'cred-1',
        name: null,
        platform: Platform.TWITTER,
      },
    ]);
  });

  it.each([
    [
      'a post video',
      { ingredients: [{ category: IngredientCategory.VIDEO, id: 'clip-1' }] },
      {
        ingredient: { category: IngredientCategory.VIDEO, id: 'clip-1' },
        isVideo: true,
      },
    ],
    [
      'a post image',
      { ingredients: [{ category: IngredientCategory.IMAGE, id: 'img-1' }] },
      {
        ingredient: { category: IngredientCategory.IMAGE, id: 'img-1' },
        isVideo: false,
      },
    ],
    ['a text-only post', { ingredients: [] }, null],
  ])('shows the first media item of %s', (_case, fields, expected) => {
    const items = createPublishingContentLibraryItems({
      articles: [],
      newsletters: [],
      posts: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          description: 'Hello',
          id: 'post-1',
          platform: Platform.TIKTOK,
          ...fields,
        },
      ] as unknown as IPost[],
    });

    expect(items[0]?.media).toEqual(expected);
  });

  it.each([
    [
      'its first media URL',
      [
        {
          assetId: 'b',
          kind: 'image',
          order: 1,
          url: 'https://cdn.example/b.jpg',
        },
        {
          assetId: 'a',
          kind: 'video',
          order: 0,
          url: 'https://cdn.example/a.jpg',
        },
      ],
      { isVideo: true, url: 'https://cdn.example/a.jpg' },
    ],
    ['the text mark when it has no media', [], null],
  ])('gives a release %s', (_case, media, expected) => {
    const items = createPublishingContentLibraryItems({
      articles: [],
      newsletters: [],
      posts: [],
      releases: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          id: 'release-1',
          media,
          status: 'draft',
          targets: [],
          title: 'Launch',
        },
      ] as unknown as IReleaseGroup[],
    });

    expect(items[0]?.media).toEqual(expected);
  });
  it('shows the first image of a release from the post that carries its assets', () => {
    const items = createPublishingContentLibraryItems({
      articles: [],
      newsletters: [],
      posts: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          description: 'Winter carousel',
          id: 'post-1',
          ingredients: [
            { category: IngredientCategory.IMAGE, id: 'asset-1' },
            { category: IngredientCategory.IMAGE, id: 'asset-2' },
          ],
          platform: Platform.INSTAGRAM,
        },
      ] as unknown as IPost[],
      releases: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          id: 'release-1',
          media: [
            { assetId: 'asset-2', kind: 'image', order: 1 },
            { assetId: 'asset-1', kind: 'image', order: 0 },
          ],
          status: 'published',
          targets: [{ id: 'post-1', platform: Platform.INSTAGRAM }],
          title: 'Winter carousel',
        },
      ] as unknown as IReleaseGroup[],
    });

    expect(items[0]?.media).toEqual({
      ingredient: { category: IngredientCategory.IMAGE, id: 'asset-1' },
      isVideo: false,
    });
  });

  it('shows the first image of a lone post the API projects as a release with no media', () => {
    const items = createPublishingContentLibraryItems({
      articles: [],
      newsletters: [],
      posts: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          description: 'Winter carousel',
          id: 'post-1',
          ingredients: [
            { category: IngredientCategory.IMAGE, id: 'asset-1' },
            { category: IngredientCategory.IMAGE, id: 'asset-2' },
          ],
          platform: Platform.INSTAGRAM,
        },
      ] as unknown as IPost[],
      releases: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          id: 'post-1',
          media: [],
          status: 'published',
          targets: [{ id: 'post-1', platform: Platform.INSTAGRAM }],
          title: 'Winter carousel',
        },
      ] as unknown as IReleaseGroup[],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.media).toEqual({
      ingredient: { category: IngredientCategory.IMAGE, id: 'asset-1' },
      isVideo: false,
    });
  });

  it('skips a deleted ingredient when picking the first image', () => {
    const items = createPublishingContentLibraryItems({
      articles: [],
      newsletters: [],
      posts: [
        {
          createdAt: '2026-08-08T10:00:00.000Z',
          description: 'Rooftop carousel',
          id: 'post-1',
          ingredients: [
            { category: IngredientCategory.IMAGE, id: 'gone', isDeleted: true },
            {
              category: IngredientCategory.IMAGE,
              id: 'live',
              isDeleted: false,
            },
          ],
          platform: Platform.INSTAGRAM,
        },
      ] as unknown as IPost[],
    });

    expect(items[0]?.media).toEqual({
      ingredient: {
        category: IngredientCategory.IMAGE,
        id: 'live',
        isDeleted: false,
      },
      isVideo: false,
    });
  });
});

describe('createPublishingBoardColumns', () => {
  const item = (id: string, status: string): PublishingContentLibraryItem => ({
    channel: 'twitter',
    createdAt: '2026-11-05T10:00:00.000Z',
    id,
    status,
    summary: '',
    title: id,
    type: 'post',
  });

  it.each([
    {
      expected: [
        'draft:1',
        'scheduled:0',
        'publishing:0',
        'published:2',
        'failed:0',
      ],
      isStatusFiltered: false,
      items: [
        item('a', 'published'),
        item('b', 'draft'),
        item('c', 'published'),
      ],
      name: 'keeps the five lanes in lifecycle order, empty ones too',
    },
    {
      expected: [
        'draft:0',
        'pending:1',
        'scheduled:0',
        'publishing:0',
        'published:0',
        'private:1',
        'failed:0',
      ],
      isStatusFiltered: false,
      items: [item('a', 'private'), item('b', 'pending')],
      name: 'slots any other status in where it belongs',
    },
    {
      expected: ['published:1'],
      isStatusFiltered: true,
      items: [item('a', 'published')],
      name: 'shows only the statuses left under a status filter',
    },
  ])('$name', ({ expected, isStatusFiltered, items }) => {
    expect(
      createPublishingBoardColumns(items, isStatusFiltered).map(
        (column) => `${column.status}:${column.items.length}`,
      ),
    ).toEqual(expected);
  });
});

describe('release targets and their connected account', () => {
  const release = {
    baseContent: 'Sofa day',
    createdAt: '2026-11-26T09:00:00.000Z',
    id: 'release-1',
    media: [],
    status: 'published',
    targets: [
      { credentialId: 'credential-1', id: 'post-1', platform: 'instagram' },
      { credentialId: 'credential-2', id: 'post-2', platform: 'twitter' },
    ],
    title: 'Sofa day carousel',
  } as unknown as IReleaseGroup;
  const credentials = [
    {
      externalHandle: 'koro',
      externalName: 'Koro',
      id: 'credential-1',
      platform: 'instagram',
    },
  ] as unknown as ICredential[];

  it('gives each target the connected account the list does not carry', () => {
    const [item] = createPublishingContentLibraryItems({
      articles: [],
      credentials,
      newsletters: [],
      posts: [],
      releases: [release],
    });

    expect(item?.release?.targets?.map((target) => target.credential)).toEqual([
      credentials[0],
      undefined,
    ]);
    expect(item?.accounts?.map((account) => account.id)).toEqual([
      'credential-1',
    ]);
  });
});

describe('hasPublishingInFlight', () => {
  it.each([
    [
      'a publishing release',
      { releases: [{ status: 'publishing' }], posts: [] },
    ],
    ['a processing post', { releases: [], posts: [{ status: 'PROCESSING' }] }],
  ])('is true for %s', (_name, input) => {
    expect(
      hasPublishingInFlight(
        input as unknown as { posts: IPost[]; releases: IReleaseGroup[] },
      ),
    ).toBe(true);
  });

  it.each([
    ['nothing', { releases: [], posts: [] }],
    [
      'finished and waiting posts',
      {
        posts: [{ status: 'DRAFT' }],
        releases: [{ status: 'published' }, { status: 'scheduled' }],
      },
    ],
  ])('is false for %s', (_name, input) => {
    expect(
      hasPublishingInFlight(
        input as unknown as { posts: IPost[]; releases: IReleaseGroup[] },
      ),
    ).toBe(false);
  });
});
