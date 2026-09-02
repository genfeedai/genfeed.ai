import type { CacheService } from '@server/services/cache/cache.service';

/**
 * Server-owned pending-confirmation record for tools that gate execution on a
 * card the operator clicked (`ctx.confirmationOrigin === 'thread-ui-action'`).
 * Modeled on the campaign preparation cache in
 * `agent-campaign-tool-handler.service.ts`: a card build persists one of
 * these keyed by `(organizationId, threadId, toolName, sourceActionId)`, and
 * the confirmed resume must present a `sourceActionId` that matches — an
 * unknown or forged id is rejected rather than trusted.
 */

const TOOL_CONFIRMATION_TTL_SECONDS = 3_600;

export type PendingToolConfirmation = {
  organizationId: string;
  sourceActionId: string;
  threadId: string;
  toolName: string;
};

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function buildToolConfirmationCacheKey(params: {
  organizationId: string;
  sourceActionId: string;
  threadId: string;
  toolName: string;
}): string {
  return [
    'agent-tool-confirmation',
    params.organizationId,
    params.threadId,
    params.toolName,
    params.sourceActionId,
  ].join(':');
}

export function readPendingToolConfirmation(
  value: unknown,
): PendingToolConfirmation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const organizationId = readNonEmptyString(candidate.organizationId);
  const sourceActionId = readNonEmptyString(candidate.sourceActionId);
  const threadId = readNonEmptyString(candidate.threadId);
  const toolName = readNonEmptyString(candidate.toolName);

  if (!organizationId || !sourceActionId || !threadId || !toolName) {
    return null;
  }

  return { organizationId, sourceActionId, threadId, toolName };
}

export async function persistPendingToolConfirmation(
  cacheService: CacheService,
  params: PendingToolConfirmation,
): Promise<boolean> {
  return cacheService.set(buildToolConfirmationCacheKey(params), params, {
    ttl: TOOL_CONFIRMATION_TTL_SECONDS,
  });
}

export async function verifyPendingToolConfirmation(
  cacheService: CacheService,
  params: PendingToolConfirmation,
): Promise<boolean> {
  const raw = await cacheService.get<unknown>(
    buildToolConfirmationCacheKey(params),
  );
  const pending = readPendingToolConfirmation(raw);
  return (
    pending !== null &&
    pending.organizationId === params.organizationId &&
    pending.sourceActionId === params.sourceActionId &&
    pending.threadId === params.threadId &&
    pending.toolName === params.toolName
  );
}
