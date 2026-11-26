import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { normalizeActivityDocument } from '@api/collections/activities/utils/activity-document.util';
import { orderedPostIngredientLinks } from '@api/collections/posts/services/post-ingredient-links.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { ActivityKey, parsePostTransition } from '@genfeedai/contracts';
import type {
  IActivityPostGroup,
  IActivityPostPreview,
  IActivityPostStep,
} from '@genfeedai/contracts/interfaces';
import { traced } from '@libs/tracing/traced';

/** The events that tell one post's story; the feed folds them into one row. */
const POST_EVENT_KEYS: readonly string[] = [
  ActivityKey.POST_LIFECYCLE_TRANSITION,
  ActivityKey.POST_PUBLISHED,
];

/**
 * A post writes a handful of events; this only bounds the read against a
 * runaway one. It is far above any real trail, so a group is never cut short.
 */
const MAX_EVENTS_PER_POST = 500;

const LEADING_AT_PATTERN = /^@/u;
const PUBLISHED_VALUE_PATTERN = /^Published to ([\w-]+):\s*(https?:\/\/\S+)/iu;

/** Only the media columns the response projection needs to sign a thumbnail. */
const POST_MEDIA_SELECT = {
  brandId: true,
  category: true,
  id: true,
  isDeleted: true,
  organizationId: true,
  s3Key: true,
  status: true,
} as const;

function isPostEvent(activity: ActivityDocument): boolean {
  return (
    POST_EVENT_KEYS.includes(String(activity.key ?? '')) &&
    Boolean(activity.entityId) &&
    Boolean(activity.organizationId)
  );
}

function compareNewestFirst(a: ActivityDocument, b: ActivityDocument): number {
  const byTime = b.createdAt.getTime() - a.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function toStep(event: ActivityDocument): IActivityPostStep | undefined {
  if (event.key !== ActivityKey.POST_LIFECYCLE_TRANSITION) return undefined;
  const transition = parsePostTransition(event.value);
  if (!transition) return undefined;
  const parsed = JSON.parse(event.value ?? '{}') as { error?: unknown };
  const error =
    typeof parsed.error === 'string' && parsed.error.trim()
      ? parsed.error.trim()
      : undefined;
  return {
    at: event.createdAt.toISOString(),
    from: transition.from,
    to: transition.to,
    ...(error ? { error } : {}),
  };
}

interface PostEvents {
  /** The newest listed event: the one row the feed keeps for the post. */
  representative?: ActivityDocument;
  /** Newest first. */
  events: ActivityDocument[];
  group: IActivityPostGroup;
  publishedUrl?: string;
}

function summarizePost(
  postId: string,
  events: ActivityDocument[],
  listedIds: ReadonlySet<string>,
): PostEvents {
  const steps = events
    .map(toStep)
    .filter((step): step is IActivityPostStep => Boolean(step))
    .reverse();
  const last = steps[steps.length - 1];
  const publishedUrl = events
    .map((event) =>
      event.key === ActivityKey.POST_PUBLISHED
        ? PUBLISHED_VALUE_PATTERN.exec(event.value ?? '')?.[2]
        : undefined,
    )
    .find(Boolean);
  return {
    events,
    group: {
      ...(last?.error ? { error: last.error } : {}),
      eventIds: events.map((event) => event.id),
      postId,
      status: last?.to ?? 'published',
      steps,
    },
    publishedUrl,
    // The newest event the list itself can return: a filtered list keeps its
    // own events of the post, never one that only the full trail holds.
    representative: events.find((event) => listedIds.has(event.id)),
  };
}

function previewFor(
  post: {
    credential: {
      externalAvatar: string | null;
      externalHandle: string | null;
      externalName: string | null;
      platform: string;
    } | null;
    description: string;
    label: string | null;
    platform: string | null;
    publishedAt: Date | null;
    url: string | null;
  },
  publishedUrl: string | undefined,
): IActivityPostPreview | undefined {
  const platform = post.platform ?? post.credential?.platform;
  const text = post.description || post.label;
  if (!platform || !text) return undefined;
  const handle = post.credential?.externalHandle?.replace(
    LEADING_AT_PATTERN,
    '',
  );
  const url = post.url ?? publishedUrl;
  return {
    ...(post.credential?.externalAvatar
      ? { authorAvatarUrl: post.credential.externalAvatar }
      : {}),
    ...(handle ? { authorHandle: handle } : {}),
    ...(post.credential?.externalName
      ? { authorName: post.credential.externalName }
      : {}),
    kind: 'post',
    platform,
    ...(post.publishedAt
      ? { publishedAt: post.publishedAt.toISOString() }
      : {}),
    text,
    ...(url ? { url } : {}),
  };
}

/**
 * One feed row per post. A post's lifecycle writes several activities (each
 * state change, and the publish itself); the page keeps only the newest of
 * them and gives it the whole trail, the post's own text and account, and its
 * first media. The older events of the same post, on this page or another, are
 * dropped: the row appears once, where its newest event sorts.
 *
 * Every read is by id and scoped to the activity's own organization.
 */
export const collapsePostActivities = traced(
  'collapsePostActivities',
  async (
    prisma: PrismaService,
    activities: ActivityDocument[],
    listWhere: Record<string, unknown> = {},
  ): Promise<ActivityDocument[]> => {
    const candidates = activities.filter(isPostEvent);
    if (!candidates.length) return activities;

    const postIdsByOrganization = new Map<string, Set<string>>();
    for (const activity of candidates) {
      const organizationId = activity.organizationId as string;
      const ids = postIdsByOrganization.get(organizationId) ?? new Set();
      ids.add(activity.entityId as string);
      postIdsByOrganization.set(organizationId, ids);
    }

    const summaries = new Map<string, PostEvents>();
    const postRows = new Map<
      string,
      Awaited<ReturnType<typeof loadPosts>>[number]
    >();
    for (const [organizationId, ids] of postIdsByOrganization) {
      const postIds = [...ids];
      // The whole trail of each post: its length and its read state must not
      // depend on how many events the page happens to hold.
      const [rows, posts] = await Promise.all([
        prisma.activity.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: postIds.length * MAX_EVENTS_PER_POST,
          where: scopedWhere(organizationId, {
            action: { in: [...POST_EVENT_KEYS] },
            entityId: { in: postIds },
          }),
        }),
        loadPosts(prisma, organizationId, postIds),
      ]);
      const listedIds = new Set(
        (
          await prisma.activity.findMany({
            select: { id: true },
            take: rows.length,
            where: scopedWhere(organizationId, {
              AND: [listWhere],
              id: { in: rows.map((row) => row.id) },
            }),
          })
        ).map((row) => row.id),
      );
      const eventsByPost = new Map<string, ActivityDocument[]>();
      for (const row of rows) {
        const event = normalizeActivityDocument(row as ActivityDocument);
        const events = eventsByPost.get(event.entityId as string) ?? [];
        events.push(event);
        eventsByPost.set(event.entityId as string, events);
      }
      for (const [postId, events] of eventsByPost) {
        summaries.set(
          `${organizationId}:${postId}`,
          summarizePost(postId, events.sort(compareNewestFirst), listedIds),
        );
      }
      for (const post of posts)
        postRows.set(`${organizationId}:${post.id}`, post);
    }

    return activities.flatMap((activity) => {
      if (!isPostEvent(activity)) return [activity];
      const key = `${activity.organizationId}:${activity.entityId}`;
      const summary = summaries.get(key);
      // Without the post's own events the row stands as it is.
      if (!summary) return [activity];
      // An older event of a post whose newest event sorts elsewhere.
      if (summary.representative?.id !== activity.id) return [];
      const post = postRows.get(key);
      const preview = post ? previewFor(post, summary.publishedUrl) : undefined;
      const ingredient = post?.ingredientLinks[0]?.ingredient;
      return [
        {
          ...activity,
          ...(ingredient ? { ingredient } : {}),
          isRead: summary.events.every((event) => event.isRead === true),
          postGroup: summary.group,
          ...(preview ? { preview } : {}),
        },
      ];
    });
  },
);

function loadPosts(
  prisma: PrismaService,
  organizationId: string,
  postIds: string[],
) {
  return prisma.post.findMany({
    select: {
      credential: {
        select: {
          externalAvatar: true,
          externalHandle: true,
          externalName: true,
          platform: true,
        },
        where: { isDeleted: false, organizationId },
      },
      description: true,
      id: true,
      ingredientLinks: {
        ...orderedPostIngredientLinks(
          { select: POST_MEDIA_SELECT },
          { isDeleted: false, organizationId },
        ),
        take: 1,
      },
      label: true,
      platform: true,
      publishedAt: true,
      url: true,
    },
    where: scopedWhere(organizationId, { id: { in: postIds } }),
  });
}
