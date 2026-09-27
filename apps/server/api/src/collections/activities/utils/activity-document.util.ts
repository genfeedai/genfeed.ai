import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import {
  getActionOriginContext,
  normalizeActionOrigin,
  withActionOriginMetadata,
} from '@api/index';
import type { Prisma } from '@genfeedai/prisma';

/** Wire-shaped activity fields a producer may set; persisted as columns + `data`. */
export interface ActivityMutationInput {
  action?: string | null;
  brandId?: string | null;
  data?: Record<string, unknown>;
  entityId?: string | null;
  entityModel?: string | null;
  id?: string;
  isDeleted?: boolean;
  isRead?: boolean;
  key?: string | null;
  organizationId?: string | null;
  source?: string | null;
  userId?: string | null;
  value?: string | null;
}

/** Persisted activity columns. */
export interface ActivityRowMutation {
  action: string | null;
  brandId: string | null;
  data?: Prisma.InputJsonObject;
  entityId: string | null;
  entityModel: string | null;
  id?: string;
  isDeleted?: boolean;
  organizationId: string | null;
  userId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Build the persisted row for a create (no `existing`) or an update. Wire
 * fields `key`/`source`/`value`/`isRead` live in the `data` JSON; `action`
 * mirrors the key. Action-origin metadata is stamped from the request context
 * on create and preserved from the stored row on update.
 */
export function buildActivityMutation(
  input: ActivityMutationInput,
  existing?: Pick<
    ActivityDocument,
    | 'action'
    | 'brandId'
    | 'data'
    | 'entityId'
    | 'entityModel'
    | 'organizationId'
    | 'userId'
  > | null,
): ActivityRowMutation {
  const currentData = isRecord(existing?.data) ? { ...existing.data } : {};
  const nextData: Record<string, unknown> = {
    ...currentData,
    ...(isRecord(input.data) ? input.data : {}),
  };

  if (input.key !== undefined) nextData.key = input.key;
  if (input.source !== undefined) nextData.source = input.source;
  if (input.value !== undefined) nextData.value = input.value;
  if (input.isRead !== undefined) nextData.isRead = input.isRead;

  const originContext = existing
    ? {
        ...(typeof currentData.actorUserId === 'string'
          ? { actorUserId: currentData.actorUserId }
          : {}),
        ...(typeof currentData.apiKeyId === 'string'
          ? { apiKeyId: currentData.apiKeyId }
          : {}),
        origin: normalizeActionOrigin(currentData.origin),
      }
    : getActionOriginContext();
  const trustedData = withActionOriginMetadata(nextData, originContext);

  return {
    action: input.action ?? input.key ?? existing?.action ?? null,
    brandId: input.brandId ?? existing?.brandId ?? null,
    entityId: input.entityId ?? existing?.entityId ?? null,
    entityModel: input.entityModel ?? existing?.entityModel ?? null,
    organizationId: input.organizationId ?? existing?.organizationId ?? null,
    userId: input.userId ?? existing?.userId ?? null,
    ...(input.id ? { id: input.id } : {}),
    ...(Object.keys(trustedData).length > 0
      ? { data: trustedData as Prisma.InputJsonObject }
      : {}),
    ...(input.isDeleted !== undefined ? { isDeleted: input.isDeleted } : {}),
  };
}

/**
 * Promote the wire contract (`key`, `value`, `source`, `isRead`, `status`,
 * origin) from the `data` JSON onto the document, as serializers and the
 * frontend expect. The key falls back to the `action` column so list UIs never
 * render a blank row.
 */
export function normalizeActivityDocument(
  document: ActivityDocument,
): ActivityDocument {
  if (!document || typeof document !== 'object') {
    return document;
  }
  const normalized = document;
  const data = isRecord(normalized.data) ? { ...normalized.data } : {};
  const origin = normalizeActionOrigin(normalized.origin ?? data.origin);
  data.origin = origin;
  normalized.data = data as Prisma.JsonValue;
  normalized.origin = origin;

  const keyFromData =
    typeof data.key === 'string' && data.key.length > 0 ? data.key : null;
  const actionKey =
    typeof normalized.action === 'string' && normalized.action.length > 0
      ? normalized.action
      : null;
  const existingKey =
    typeof normalized.key === 'string' && normalized.key.length > 0
      ? normalized.key
      : null;
  normalized.key = existingKey ?? keyFromData ?? actionKey ?? null;

  if (
    (typeof normalized.value !== 'string' || normalized.value.length === 0) &&
    typeof data.value === 'string'
  ) {
    normalized.value = data.value;
  }
  if (
    (typeof normalized.source !== 'string' || normalized.source.length === 0) &&
    typeof data.source === 'string'
  ) {
    normalized.source = data.source;
  }
  if (typeof normalized.isRead !== 'boolean') {
    normalized.isRead = typeof data.isRead === 'boolean' ? data.isRead : false;
  }
  if (
    (typeof normalized.status !== 'string' || normalized.status.length === 0) &&
    typeof data.status === 'string'
  ) {
    normalized.status = data.status;
  }
  normalized.actorUserId =
    typeof normalized.actorUserId === 'string'
      ? normalized.actorUserId
      : typeof data.actorUserId === 'string'
        ? data.actorUserId
        : null;
  normalized.apiKeyId =
    typeof normalized.apiKeyId === 'string'
      ? normalized.apiKeyId
      : typeof data.apiKeyId === 'string'
        ? data.apiKeyId
        : null;
  return normalized;
}
