import { COLLABORATION_NOTIFICATION_TOPIC } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import {
  APP_ROUTES,
  createLibraryAssetRoute,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';

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
