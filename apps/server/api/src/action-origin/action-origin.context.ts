import { AsyncLocalStorage } from 'node:async_hooks';
import { ActionOrigin, type ActionOriginContext } from '@genfeedai/enums';

const storage = new AsyncLocalStorage<ActionOriginContext>();

const EXTERNAL_INITIATING_ORIGINS = new Set<ActionOrigin>([
  ActionOrigin.AGENT,
  ActionOrigin.API,
  ActionOrigin.CLI,
  ActionOrigin.MCP,
]);

export function normalizeActionOrigin(value: unknown): ActionOrigin {
  return Object.values(ActionOrigin).includes(value as ActionOrigin)
    ? (value as ActionOrigin)
    : ActionOrigin.UNKNOWN;
}

export function sanitizeActionOriginContext(
  value: Partial<ActionOriginContext> | null | undefined,
): ActionOriginContext {
  return {
    ...(typeof value?.actorUserId === 'string' && value.actorUserId.length > 0
      ? { actorUserId: value.actorUserId }
      : {}),
    ...(typeof value?.apiKeyId === 'string' && value.apiKeyId.length > 0
      ? { apiKeyId: value.apiKeyId }
      : {}),
    origin: normalizeActionOrigin(value?.origin),
  };
}

export function getActionOriginContext(): ActionOriginContext {
  return (
    storage.getStore() ?? {
      origin: ActionOrigin.UNKNOWN,
    }
  );
}

export function runWithActionOrigin<T>(
  context: Partial<ActionOriginContext>,
  callback: () => T,
): T {
  return storage.run(sanitizeActionOriginContext(context), callback);
}

/**
 * Reclassify UI/unknown work at a trusted internal execution boundary while
 * retaining an already-proven external initiator across nested work.
 */
export function resolveNestedActionOrigin(
  nestedOrigin: ActionOrigin.AGENT | ActionOrigin.WORKFLOW,
): ActionOriginContext {
  const current = getActionOriginContext();
  return EXTERNAL_INITIATING_ORIGINS.has(current.origin)
    ? current
    : { ...current, origin: nestedOrigin };
}

export function withActionOriginMetadata(
  metadata: Record<string, unknown> | null | undefined,
  context: ActionOriginContext = getActionOriginContext(),
): Record<string, unknown> {
  const normalized = sanitizeActionOriginContext(context);
  const {
    actorUserId: _untrustedActorUserId,
    apiKeyId: _untrustedApiKeyId,
    origin: _untrustedOrigin,
    ...safeMetadata
  } = metadata ?? {};
  return {
    ...safeMetadata,
    ...(normalized.actorUserId ? { actorUserId: normalized.actorUserId } : {}),
    ...(normalized.apiKeyId ? { apiKeyId: normalized.apiKeyId } : {}),
    origin: normalized.origin,
  };
}
