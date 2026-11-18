import { COLLABORATION_NOTIFICATION_TOPIC } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createLibraryAssetRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { getActivityAlertPolicy } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

export function inboxSourceHref(
  organizationSlug: string | null | undefined,
  brandSlug: string | null | undefined,
  path: string,
): string | null {
  const org = organizationSlug ?? '';
  if (org.length === 0) {
    return null;
  }
  const slug = brandSlug ?? '';
  if (slug.length > 0) {
    return createBrandAppRoute(org, slug, path);
  }
  return createOrganizationAppRoute(org, path);
}

/**
 * A review request, review decision or mention (#9947). The item links to the
 * asset, thread or task it is about, inside the brand it belongs to.
 */
export function readCollaborationPayload(
  topic: string,
  payload: Prisma.JsonValue,
): { brandId: string | null; path: string | null } | null {
  if (
    topic !== COLLABORATION_NOTIFICATION_TOPIC ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.kind !== 'collaboration' ||
    payload.version !== 1
  ) {
    return null;
  }
  const readId = (value: Prisma.JsonValue | undefined): string | null =>
    typeof value === 'string' && value.length > 0 && value.length <= 200
      ? value
      : null;
  const ingredientId = readId(payload.ingredientId);
  const threadId = readId(payload.threadId);
  const taskIdentifier = readId(payload.taskIdentifier);
  const path = ingredientId
    ? createLibraryAssetRoute(payload.ingredientCategory, ingredientId)
    : threadId
      ? `${APP_ROUTES.AGENT.ROOT}/${encodeURIComponent(threadId)}`
      : taskIdentifier
        ? `${APP_ROUTES.WORKSPACE.TASKS}/${encodeURIComponent(taskIdentifier)}`
        : null;
  return { brandId: readId(payload.brandId), path };
}

/**
 * The bell row for a review, decision or mention alert, or null for any other
 * row. A brand the member cannot open leaves the item listed without a link.
 */
export function collaborationInboxItem<
  A,
  R extends {
    event: { eventKey: string; payload: Prisma.JsonValue };
    id: string;
    occurredAt: Date;
    readAt: Date | null;
    topic: string;
  },
>(input: {
  activity: A;
  brandSlugs: Map<string, string>;
  orgSlug: string;
  row: R;
}) {
  const { activity, brandSlugs, orgSlug, row } = input;
  const collaboration = readCollaborationPayload(row.topic, row.event.payload);
  if (!collaboration) return null;
  const brandSlug = collaboration.brandId
    ? brandSlugs.get(collaboration.brandId)
    : undefined;
  const canLink =
    collaboration.path !== null &&
    (collaboration.brandId === null || brandSlug !== undefined);
  return {
    activity,
    failure: null,
    id: row.id,
    occurredAt: row.occurredAt,
    outcome: 'completed' as const,
    readAt: row.readAt,
    severity: getActivityAlertPolicy(row.event.eventKey)?.severity ?? null,
    sourceHref:
      canLink && collaboration.path
        ? inboxSourceHref(orgSlug, brandSlug, collaboration.path)
        : null,
    sourceLabel: null,
    topic: row.topic,
  };
}
