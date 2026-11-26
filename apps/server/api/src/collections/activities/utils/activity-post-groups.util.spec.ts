import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { collapsePostActivities } from '@api/collections/activities/utils/activity-post-groups.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivityKey } from '@genfeedai/contracts';

interface Where {
  action?: { in: string[] };
  entityId?: { in: string[] };
  id?: { in: string[] };
  isDeleted: boolean;
  organizationId: string;
}

function event(
  id: string,
  postId: string,
  key: ActivityKey,
  at: string,
  value: string,
  extra: Partial<ActivityDocument> = {},
): ActivityDocument {
  return {
    action: key,
    createdAt: new Date(at),
    data: { isRead: false, key, value },
    entityId: postId,
    entityModel: 'post',
    id,
    isDeleted: false,
    key,
    organizationId: 'org-1',
    value,
    ...extra,
  } as unknown as ActivityDocument;
}

const transition = (
  id: string,
  postId: string,
  from: string,
  to: string,
  at: string,
  extra: Partial<ActivityDocument> = {},
  error?: string,
) =>
  event(
    id,
    postId,
    ActivityKey.POST_LIFECYCLE_TRANSITION,
    at,
    JSON.stringify({ from, to, ...(error ? { error } : {}) }),
    extra,
  );

const published = (id: string, postId: string, at: string, url: string) =>
  event(
    id,
    postId,
    ActivityKey.POST_PUBLISHED,
    at,
    `Published to instagram: ${url}`,
  );

const ingredient = {
  brandId: 'brand-1',
  category: 'IMAGE',
  id: 'media-1',
  isDeleted: false,
  organizationId: 'org-1',
  s3Key: 'ingredients/images/media-1',
  status: 'GENERATED',
};

const POSTS = [
  {
    credential: {
      externalAvatar: 'https://cdn.example/avatar.png',
      externalHandle: '@northwind.coffee',
      externalName: 'Northwind Coffee',
      platform: 'instagram',
    },
    description: 'Cold brew season is here.',
    id: 'post-1',
    ingredientLinks: [{ ingredient }],
    label: null,
    organizationId: 'org-1',
    platform: 'instagram',
    publishedAt: new Date('2026-11-26T08:45:33Z'),
    url: null,
  },
  {
    credential: null,
    description: 'Weekly batch shipped.',
    id: 'post-2',
    ingredientLinks: [],
    label: null,
    organizationId: 'org-1',
    platform: 'twitter',
    publishedAt: null,
    url: 'https://x.com/status/2',
  },
  {
    credential: null,
    description: 'Another organization’s post.',
    id: 'post-1',
    ingredientLinks: [],
    label: null,
    organizationId: 'org-2',
    platform: 'twitter',
    publishedAt: null,
    url: null,
  },
];

function prismaWith(events: ActivityDocument[]) {
  const matches = (where: Where, row: Record<string, unknown>) =>
    row.organizationId === where.organizationId &&
    row.isDeleted !== true &&
    (!where.entityId || where.entityId.in.includes(String(row.entityId))) &&
    (!where.action || where.action.in.includes(String(row.action))) &&
    (!where.id || where.id.in.includes(String(row.id)));
  return {
    activity: {
      findMany: async ({ where }: { where: Where }) =>
        events.filter((row) => matches(where, row)),
    },
    post: {
      findMany: async ({ where }: { where: Where }) =>
        POSTS.filter((row) => matches({ ...where, isDeleted: false }, row)),
    },
  } as unknown as PrismaService;
}

const POST_ONE_EVENTS = [
  published('pub-1', 'post-1', '2026-11-26T08:45:33.200Z', 'https://ig/p/1'),
  transition(
    'tr-2',
    'post-1',
    'publishing',
    'published',
    '2026-11-26T08:45:33.100Z',
  ),
  transition(
    'tr-1',
    'post-1',
    'scheduled',
    'publishing',
    '2026-11-26T08:45:03.000Z',
  ),
];

describe('collapsePostActivities', () => {
  it('shows a post once, with its trail, text, account and media', async () => {
    const other = event(
      'other-1',
      'img-1',
      ActivityKey.SOCIAL_HISTORY_IMPORT_SKIPPED,
      '2026-11-26T08:34:50Z',
      '',
      { entityModel: 'social' },
    );
    const result = await collapsePostActivities(prismaWith(POST_ONE_EVENTS), [
      ...POST_ONE_EVENTS,
      other,
    ]);

    expect(result.map((row) => row.id)).toEqual(['pub-1', 'other-1']);
    expect(result[0]).toMatchObject({
      ingredient: { id: 'media-1' },
      isRead: false,
      postGroup: {
        eventIds: ['pub-1', 'tr-2', 'tr-1'],
        postId: 'post-1',
        status: 'published',
        steps: [
          {
            at: '2026-11-26T08:45:03.000Z',
            from: 'scheduled',
            to: 'publishing',
          },
          {
            at: '2026-11-26T08:45:33.100Z',
            from: 'publishing',
            to: 'published',
          },
        ],
      },
      preview: {
        authorHandle: 'northwind.coffee',
        authorName: 'Northwind Coffee',
        kind: 'post',
        platform: 'instagram',
        text: 'Cold brew season is here.',
        url: 'https://ig/p/1',
      },
    });
  });

  it('keeps the row where the newest event sorts and drops older fragments elsewhere', async () => {
    const db = prismaWith(POST_ONE_EVENTS);
    const newestPage = await collapsePostActivities(db, [POST_ONE_EVENTS[0]]);
    const olderPage = await collapsePostActivities(
      db,
      POST_ONE_EVENTS.slice(1),
    );

    expect(newestPage.map((row) => row.id)).toEqual(['pub-1']);
    expect(newestPage[0].postGroup?.steps).toHaveLength(2);
    expect(olderPage).toEqual([]);
  });

  it('reads the post as unread until every event is read', async () => {
    const allRead = POST_ONE_EVENTS.map((row) => ({ ...row, isRead: true }));
    const someRead = POST_ONE_EVENTS.map((row, index) => ({
      ...row,
      isRead: index > 0,
    }));

    const [read] = await collapsePostActivities(prismaWith(allRead), allRead);
    const [unread] = await collapsePostActivities(
      prismaWith(someRead),
      someRead,
    );

    expect([read.isRead, unread.isRead]).toEqual([true, false]);
  });

  it('carries the failure of a post that did not go out', async () => {
    const events = [
      transition(
        'fail-2',
        'post-2',
        'publishing',
        'failed',
        '2026-11-26T09:05:41Z',
        {},
        'The platform rejected the upload.',
      ),
      transition(
        'fail-1',
        'post-2',
        'scheduled',
        'publishing',
        '2026-11-26T09:05:00Z',
      ),
    ];

    const [row] = await collapsePostActivities(prismaWith(events), events);

    expect(row.postGroup).toMatchObject({
      error: 'The platform rejected the upload.',
      status: 'failed',
    });
    expect(row.ingredient).toBeUndefined();
  });

  it('never shows another organization’s post under an activity', async () => {
    const events = [
      transition(
        'org2-1',
        'post-1',
        'scheduled',
        'publishing',
        '2026-11-26T09:00:00Z',
        { organizationId: 'org-2' },
      ),
    ];

    const [row] = await collapsePostActivities(prismaWith(events), events);

    expect(row.preview?.text).toBe('Another organization’s post.');
    expect(row.ingredient).toBeUndefined();
  });

  it('leaves a post event whose post is gone as it is, without a preview', async () => {
    const events = [
      transition(
        'gone-1',
        'post-missing',
        'scheduled',
        'publishing',
        '2026-11-26T09:00:00Z',
      ),
    ];

    const [row] = await collapsePostActivities(prismaWith(events), events);

    expect(row.preview).toBeUndefined();
    expect(row.postGroup).toMatchObject({
      eventIds: ['gone-1'],
      status: 'publishing',
    });
  });
});
