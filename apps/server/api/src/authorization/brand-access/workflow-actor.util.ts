import { createHash } from 'node:crypto';
import { findActorApiKey } from '@api/authorization/brand-access/actor-api-key.util';
import type {
  BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import { isCloudDeployment } from '@genfeedai/config';
import type { Prisma } from '@genfeedai/prisma';
import { ForbiddenException, Logger } from '@nestjs/common';

/** The authenticated identity a queued or scheduled workflow acts as. Never inferred from a creator or owner id. */
export type WorkflowInitiatingActor = {
  apiKeyId?: string;
  isApiKey: boolean;
  organizationId: string;
  scopes: string[];
  userId: string;
};

export type WorkflowActorDenial = (reason?: string) => never;

const denialLogger = new Logger('WorkflowActorDenial');

/** The check that refused each denial, kept beside the exception and never on it or in the response. */
const denialReasons = new WeakMap<Error, string>();

/** The check that refused a denial raised by {@link denyWorkflowActor}, for a caller that logs it. */
export function workflowActorDenialReason(error: unknown): string | undefined {
  return error instanceof Error ? denialReasons.get(error) : undefined;
}

/**
 * Every denial answers with the same message. The reason names the check that refused, so an
 * operator can tell which one from the log; it never reaches the caller.
 */
export function denyWorkflowActor(reason?: string): never {
  if (reason) denialLogger.warn(`Workflow actor denied: ${reason}`);
  const denial = new ForbiddenException('Brand access denied');
  if (reason) denialReasons.set(denial, reason);
  throw denial;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Copies only the authenticated fields; anything else on the persisted value is dropped. */
export function parseWorkflowActor(
  value: unknown,
  organizationId: string,
  deny: WorkflowActorDenial = denyWorkflowActor,
): WorkflowInitiatingActor {
  const actor = record(value);
  if (
    !nonempty(actor.userId) ||
    !nonempty(actor.organizationId) ||
    actor.organizationId !== organizationId ||
    typeof actor.isApiKey !== 'boolean' ||
    !Array.isArray(actor.scopes) ||
    !actor.scopes.every(
      (scope): scope is string => typeof scope === 'string',
    ) ||
    (actor.apiKeyId !== undefined && !nonempty(actor.apiKeyId)) ||
    (isCloudDeployment() && actor.isApiKey && !nonempty(actor.apiKeyId))
  )
    deny('actor-record-invalid');
  return {
    organizationId,
    userId: actor.userId,
    isApiKey: actor.isApiKey,
    scopes: [...new Set(actor.scopes)].sort(),
    ...(nonempty(actor.apiKeyId) ? { apiKeyId: actor.apiKeyId } : {}),
  };
}

export function toWorkflowActor(
  actor: BrandAccessActor,
  deny: WorkflowActorDenial = denyWorkflowActor,
): WorkflowInitiatingActor {
  return parseWorkflowActor(
    {
      organizationId: actor.organizationId,
      userId: actor.userId,
      isApiKey: actor.isApiKey ?? false,
      scopes: actor.scopes ?? [],
      apiKeyId: actor.apiKeyId,
    },
    actor.organizationId,
    deny,
  );
}

/** Stable identity for job ids: scope order and duplicates do not change it. */
export function workflowActorKey(
  actor: BrandAccessActor,
  deny: WorkflowActorDenial = denyWorkflowActor,
): string {
  return createHash('sha256')
    .update(JSON.stringify(toWorkflowActor(actor, deny)))
    .digest('hex');
}

/**
 * Re-reads live authority for a persisted actor: an API key must still exist, belong to the
 * actor and organization, be unrevoked and unexpired, and its scopes can only shrink. Then
 * membership and brand access are re-resolved. Actorless work is allowed only outside Cloud.
 */
export async function refreshWorkflowActor(
  tx: Prisma.TransactionClient,
  policy: BrandAccessService,
  value: unknown,
  organizationId: string,
  deny: WorkflowActorDenial = denyWorkflowActor,
): Promise<WorkflowInitiatingActor | undefined> {
  if (value === undefined && !isCloudDeployment()) return undefined;
  const actor = parseWorkflowActor(value, organizationId, deny);
  if (actor.isApiKey && isCloudDeployment()) {
    const key = await findActorApiKey(tx, { ...actor, organizationId });
    if (!key) deny('actor-api-key-not-live');
    actor.scopes = actor.scopes.filter((scope) => key.scopes.includes(scope));
  }
  await policy.resolve(actor, tx);
  return actor;
}
