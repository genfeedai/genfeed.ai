import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IActivityPostPreview } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { traced } from '@libs/tracing/traced';

/** Entity model the breakout offer records its response under. */
const BREAKOUT_RESPONSE_ENTITY_MODEL = 'BreakoutResponse';
/** Platform value for X, the only network a breakout preview links out to today. */
const X_PLATFORM = 'twitter';
const LEADING_AT_PATTERN = /^@/u;

/** Key of a user's name in `users`: the name is per organization membership. */
export function activityUserKey(
  organizationId: string,
  userId: string,
): string {
  return `${organizationId}:${userId}`;
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((id): id is string => Boolean(id)))];
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function userName(user: {
  firstName: string | null;
  handle: string;
  lastName: string | null;
}): string {
  const fullName = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .trim();
  return fullName || user.handle;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

/** The query that opens the remix for the post the offer is about. */
function remixQueryFor(response: {
  nativeSourcePostId: string | null;
  sourcePostId: string | null;
}): string | undefined {
  if (response.sourcePostId) {
    return `remixPostId=${encodeURIComponent(response.sourcePostId)}`;
  }
  if (response.nativeSourcePostId) {
    return `remixSourcePostId=${encodeURIComponent(response.nativeSourcePostId)}`;
  }
  return undefined;
}

function networkUrl(
  platform: string,
  externalId: string,
  handle: string | undefined,
  stored: string | null | undefined,
): string | undefined {
  if (stored) return stored;
  if (platform !== X_PLATFORM) return undefined;
  return `https://x.com/${handle ?? 'i'}/status/${encodeURIComponent(externalId)}`;
}

/**
 * Names for the ids an activity carries (user, organization, brand), so the UI
 * never has to print an id. Reads are by id and bounded to the page.
 */
export const loadActivityNames = traced(
  'loadActivityNames',
  async (
    prisma: PrismaService,
    activities: ActivityDocument[],
  ): Promise<{
    brands: Map<string, string>;
    organizations: Map<string, string>;
    users: Map<string, string>;
  }> => {
    const organizationIds = uniqueIds(activities.map((a) => a.organizationId));
    const brandIds = uniqueIds(activities.map((a) => a.brandId));
    const userIds = uniqueIds(activities.map((a) => a.userId));

    const [organizations, brands, members] = await Promise.all([
      organizationIds.length
        ? prisma.organization.findMany({
            select: { id: true, label: true },
            where: { id: { in: organizationIds } },
          })
        : [],
      brandIds.length && organizationIds.length
        ? prisma.brand.findMany({
            select: { id: true, label: true },
            where: {
              id: { in: brandIds },
              isDeleted: false,
              organizationId: { in: organizationIds },
            },
          })
        : [],
      // Names come from members of the activity's own organization, so an
      // activity never shows the name of a user outside its tenant.
      userIds.length && organizationIds.length
        ? prisma.member.findMany({
            select: {
              organizationId: true,
              user: {
                select: {
                  firstName: true,
                  handle: true,
                  id: true,
                  lastName: true,
                },
              },
              userId: true,
            },
            // One membership per user and organization bounds the read.
            take: userIds.length * organizationIds.length,
            where: {
              isDeleted: false,
              organizationId: { in: organizationIds },
              userId: { in: userIds },
            },
          })
        : [],
    ]);

    return {
      brands: new Map(brands.map((brand) => [brand.id, brand.label])),
      organizations: new Map(
        organizations.map((organization) => [
          organization.id,
          organization.label,
        ]),
      ),
      users: new Map(
        members.map((member) => [
          activityUserKey(member.organizationId, member.userId),
          userName(member.user),
        ]),
      ),
    };
  },
);

/**
 * The post behind each breakout activity, keyed by activity id. A breakout
 * offer stores only a sentence; the card shows the post itself.
 */
export const loadBreakoutPreviews = traced(
  'loadBreakoutPreviews',
  async (
    prisma: PrismaService,
    activities: ActivityDocument[],
  ): Promise<Map<string, IActivityPostPreview>> => {
    const candidates = activities.filter(
      (activity) =>
        activity.entityModel === BREAKOUT_RESPONSE_ENTITY_MODEL &&
        Boolean(activity.entityId) &&
        Boolean(activity.organizationId),
    );
    const previews = new Map<string, IActivityPostPreview>();
    if (!candidates.length) return previews;

    const organizationIds = uniqueIds(candidates.map((a) => a.organizationId));
    const responses = await prisma.breakoutResponse.findMany({
      select: {
        credentialId: true,
        externalId: true,
        id: true,
        nativeSourcePost: {
          select: {
            authorAvatarUrl: true,
            authorDisplayName: true,
            authorHandle: true,
            publishedAt: true,
            sourceUrl: true,
            text: true,
          },
        },
        nativeSourcePostId: true,
        organizationId: true,
        platform: true,
        sourcePost: {
          select: {
            description: true,
            id: true,
            label: true,
            publishedAt: true,
            url: true,
          },
        },
        sourcePostId: true,
        triggerReceipt: { select: { evaluation: true } },
      },
      where: {
        id: { in: uniqueIds(candidates.map((a) => a.entityId)) },
        isDeleted: false,
        organizationId: { in: organizationIds },
      },
    });

    const credentialIds = uniqueIds(
      responses
        .filter((response) => response.sourcePost)
        .map((response) => response.credentialId),
    );
    const postIds = uniqueIds(responses.map((r) => r.sourcePost?.id));
    const [credentials, analytics] = await Promise.all([
      credentialIds.length
        ? prisma.credential.findMany({
            select: {
              externalAvatar: true,
              externalHandle: true,
              externalName: true,
              id: true,
            },
            where: {
              id: { in: credentialIds },
              isDeleted: false,
              organizationId: { in: organizationIds },
            },
          })
        : [],
      postIds.length
        ? prisma.postAnalytics.findMany({
            distinct: ['postId'],
            orderBy: [{ postId: 'asc' }, { date: 'desc' }],
            select: {
              postId: true,
              totalComments: true,
              totalLikes: true,
              totalShares: true,
              totalViews: true,
            },
            // One latest row per post, so the page's posts bound the read.
            take: postIds.length,
            where: {
              isDeleted: false,
              organizationId: { in: organizationIds },
              postId: { in: postIds },
            },
          })
        : [],
    ]);
    const credentialById = new Map(credentials.map((c) => [c.id, c]));
    const analyticsByPostId = new Map(
      analytics.map((row) => [row.postId, row]),
    );
    const responseById = new Map(responses.map((r) => [r.id, r]));

    for (const activity of candidates) {
      const response = activity.entityId
        ? responseById.get(activity.entityId)
        : undefined;
      // Never show a response that belongs to another organization.
      if (!response || response.organizationId !== activity.organizationId) {
        continue;
      }
      const evaluation = response.triggerReceipt?.evaluation;
      const ratio = isRecord(evaluation)
        ? readFiniteNumber(evaluation.ratio)
        : undefined;
      const remixQuery = remixQueryFor(response);

      if (response.sourcePost) {
        const post = response.sourcePost;
        const credential = credentialById.get(response.credentialId);
        const counts = analyticsByPostId.get(post.id);
        const handle =
          credential?.externalHandle?.replace(LEADING_AT_PATTERN, '') ??
          undefined;
        previews.set(
          activity.id,
          withoutUndefined({
            authorAvatarUrl: credential?.externalAvatar ?? undefined,
            authorHandle: handle,
            authorName: credential?.externalName ?? undefined,
            kind: 'post' as const,
            metrics: counts
              ? {
                  likes: counts.totalLikes,
                  replies: counts.totalComments,
                  reposts: counts.totalShares,
                  views: counts.totalViews,
                }
              : undefined,
            platform: response.platform,
            publishedAt: post.publishedAt?.toISOString(),
            ratio,
            remixQuery,
            text: post.description || post.label || '',
            url: networkUrl(
              response.platform,
              response.externalId,
              handle,
              post.url,
            ),
          }),
        );
        continue;
      }

      const native = response.nativeSourcePost;
      if (native) {
        const handle =
          native.authorHandle?.replace(LEADING_AT_PATTERN, '') ?? undefined;
        previews.set(
          activity.id,
          withoutUndefined({
            authorAvatarUrl: native.authorAvatarUrl ?? undefined,
            authorHandle: handle,
            authorName: native.authorDisplayName ?? undefined,
            kind: 'post' as const,
            platform: response.platform,
            publishedAt: native.publishedAt?.toISOString(),
            ratio,
            remixQuery,
            text: native.text ?? '',
            url: networkUrl(
              response.platform,
              response.externalId,
              handle,
              native.sourceUrl,
            ),
          }),
        );
      }
    }
    return previews;
  },
);
