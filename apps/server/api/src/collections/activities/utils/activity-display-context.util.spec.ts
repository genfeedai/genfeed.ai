import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import {
  activityUserKey,
  loadActivityNames,
  loadBreakoutPreviews,
} from '@api/collections/activities/utils/activity-display-context.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

type Where = { id?: { in: string[] }; postId?: { in: string[] } };

/** Tables read the way the util asks for them: by id lists. */
function table<T extends { id: string }>(
  rows: T[],
  key: 'id' | 'postId' = 'id',
) {
  return {
    findMany: async ({ where }: { where: Where }) => {
      const ids = (key === 'id' ? where.id?.in : where.postId?.in) ?? [];
      return rows.filter((row) => ids.includes((row as never)[key]));
    },
  };
}

const prisma = {
  brand: table([{ id: 'brand-1', label: 'Vincent Ships It' }]),
  breakoutResponse: table([
    {
      credentialId: 'cred-1',
      externalId: '1990',
      id: 'response-post',
      nativeSourcePost: null,
      nativeSourcePostId: null,
      organizationId: 'org-1',
      platform: 'twitter',
      sourcePost: {
        description: 'Is AI not supposed to use all of the water on Earth??',
        id: 'post-1',
        label: null,
        publishedAt: new Date('2026-11-09T11:48:00.000Z'),
        url: null,
      },
      sourcePostId: 'post-1',
      triggerReceipt: { evaluation: { ratio: 6.8 } },
    },
    {
      credentialId: 'cred-1',
      externalId: '2001',
      id: 'response-native',
      nativeSourcePost: {
        authorAvatarUrl: null,
        authorDisplayName: 'Dana Fox',
        authorHandle: '@danafox',
        publishedAt: null,
        sourceUrl: 'https://x.com/danafox/status/2001',
        text: 'Shipping beats planning.',
      },
      nativeSourcePostId: 'native-1',
      organizationId: 'org-1',
      platform: 'twitter',
      sourcePost: null,
      sourcePostId: null,
      triggerReceipt: { evaluation: 'not an object' },
    },
    {
      credentialId: 'cred-9',
      externalId: '3003',
      id: 'response-other-org',
      nativeSourcePost: null,
      nativeSourcePostId: null,
      organizationId: 'org-2',
      platform: 'twitter',
      sourcePost: {
        description: 'Another account',
        id: 'post-9',
        label: null,
        publishedAt: null,
        url: null,
      },
      sourcePostId: 'post-9',
      triggerReceipt: null,
    },
  ]),
  credential: table([
    {
      externalAvatar: 'https://cdn.example/avatar.png',
      externalHandle: '@vincentshipsit',
      externalName: 'Vincent Ships It',
      id: 'cred-1',
    },
  ]),
  organization: table([{ id: 'org-1', label: 'Genfeed.Ai' }]),
  postAnalytics: table(
    [
      {
        id: 'a-1',
        postId: 'post-1',
        totalComments: 6,
        totalLikes: 38,
        totalShares: 4,
        totalViews: 9400,
      },
    ],
    'postId',
  ),
  member: {
    findMany: async ({
      where,
    }: {
      where: { organizationId: { in: string[] }; userId: { in: string[] } };
    }) =>
      [
        {
          organizationId: 'org-1',
          user: {
            firstName: 'Vincent',
            handle: 'vincent',
            id: 'user-1',
            lastName: null,
          },
          userId: 'user-1',
        },
        {
          organizationId: 'org-1',
          user: {
            firstName: null,
            handle: 'dana',
            id: 'user-2',
            lastName: null,
          },
          userId: 'user-2',
        },
        {
          organizationId: 'org-2',
          user: {
            firstName: 'Casey',
            handle: 'casey',
            id: 'user-3',
            lastName: null,
          },
          userId: 'user-3',
        },
      ].filter(
        (member) =>
          where.organizationId.in.includes(member.organizationId) &&
          where.userId.in.includes(member.userId),
      ),
  },
} as unknown as PrismaService;

const activity = (overrides: Partial<ActivityDocument>): ActivityDocument =>
  ({
    brandId: null,
    entityId: null,
    entityModel: null,
    id: 'activity',
    organizationId: 'org-1',
    userId: null,
    ...overrides,
  }) as ActivityDocument;

describe('loadActivityNames', () => {
  it('names the organization, brand and user an activity carries', async () => {
    const names = await loadActivityNames(prisma, [
      activity({ brandId: 'brand-1', userId: 'user-1' }),
      activity({ userId: 'user-2' }),
    ]);

    expect(names.organizations.get('org-1')).toBe('Genfeed.Ai');
    expect(names.brands.get('brand-1')).toBe('Vincent Ships It');
    expect(names.users.get(activityUserKey('org-1', 'user-1'))).toBe('Vincent');
    // A user with no name falls back to their handle.
    expect(names.users.get(activityUserKey('org-1', 'user-2'))).toBe('dana');
  });

  it('never names a user who is not a member of the activity organization', async () => {
    const names = await loadActivityNames(prisma, [
      activity({ organizationId: 'org-1', userId: 'user-3' }),
    ]);

    expect(names.users.get(activityUserKey('org-1', 'user-3'))).toBeUndefined();
  });
});

describe('loadBreakoutPreviews', () => {
  const offer = (id: string, entityId: string, organizationId = 'org-1') =>
    activity({
      entityId,
      entityModel: 'BreakoutResponse',
      id,
      organizationId,
    });

  it('previews the member’s own post with its numbers, ratio and remix', async () => {
    const previews = await loadBreakoutPreviews(prisma, [
      offer('offer-1', 'response-post'),
    ]);

    expect(previews.get('offer-1')).toEqual({
      authorAvatarUrl: 'https://cdn.example/avatar.png',
      authorHandle: 'vincentshipsit',
      authorName: 'Vincent Ships It',
      kind: 'post',
      metrics: { likes: 38, replies: 6, reposts: 4, views: 9400 },
      platform: 'twitter',
      publishedAt: '2026-11-09T11:48:00.000Z',
      ratio: 6.8,
      remixQuery: 'remixPostId=post-1',
      text: 'Is AI not supposed to use all of the water on Earth??',
      url: 'https://x.com/vincentshipsit/status/1990',
    });
  });

  it('previews a collected post by its author and links its stored source', async () => {
    const previews = await loadBreakoutPreviews(prisma, [
      offer('offer-2', 'response-native'),
    ]);

    expect(previews.get('offer-2')).toEqual({
      authorHandle: 'danafox',
      authorName: 'Dana Fox',
      kind: 'post',
      platform: 'twitter',
      remixQuery: 'remixSourcePostId=native-1',
      text: 'Shipping beats planning.',
      url: 'https://x.com/danafox/status/2001',
    });
  });

  it('never previews a response that belongs to another organization', async () => {
    const previews = await loadBreakoutPreviews(prisma, [
      offer('offer-3', 'response-other-org'),
    ]);

    expect(previews.size).toBe(0);
  });

  it('leaves activities that are not breakout offers alone', async () => {
    const previews = await loadBreakoutPreviews(prisma, [
      activity({ entityId: 'ing-1', entityModel: 'Ingredient', id: 'other' }),
    ]);

    expect(previews.size).toBe(0);
  });
});
