import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { WorkflowSchedulePrincipal } from '@api/collections/workflows/utils/workflow-schedule-actor.util';
import { readRecord } from '@genfeedai/utils/data/extract.util';

/**
 * The authenticated identity an agent turn or tool call acts for. It is the only
 * identity a workflow schedule saved by an agent tool may be bound to: it is
 * captured where the request is authenticated (the agent-tools, chat and thread
 * UI-action controllers) and carried through the durable turn record, never
 * derived from a workflow, brand or strategy owner.
 *
 * A turn that did not start from an authenticated request (a proactive,
 * campaign or cadence run) carries none, and what it schedules stays unbound.
 */
export type AgentInitiatingPrincipal = WorkflowSchedulePrincipal;

type AuthenticatedRequestIdentity = Pick<
  AuthenticatedUser,
  'apiKeyId' | 'isApiKey' | 'scopes'
>;

/**
 * Builds the principal of an authenticated request. `userId` and
 * `organizationId` are the database ids the request resolved to, so the
 * principal always matches the context the tool executes under.
 */
export function buildAgentInitiatingPrincipal(input: {
  auth: AuthenticatedRequestIdentity;
  organizationId: string;
  userId: string;
}): AgentInitiatingPrincipal {
  const { auth, organizationId, userId } = input;
  return {
    ...(auth.apiKeyId ? { apiKeyId: auth.apiKeyId } : {}),
    isApiKey: auth.isApiKey ?? false,
    organizationId,
    scopes: [...(auth.scopes ?? [])],
    userId,
  };
}

/**
 * Reads a principal back from a durable record. Anything malformed, or issued
 * for a different user or organization than the execution that now reads it,
 * yields none: the schedule then stays unbound and is held in Cloud, never
 * bound to somebody else.
 */
export function projectAgentInitiatingPrincipal(
  value: unknown,
  expected: { organizationId: string; userId: string },
): AgentInitiatingPrincipal | undefined {
  if (value === undefined || value === null) return undefined;
  const principal = readRecord(value);
  const { apiKeyId, isApiKey, organizationId, scopes, userId } = principal;
  if (
    userId !== expected.userId ||
    organizationId !== expected.organizationId ||
    typeof isApiKey !== 'boolean' ||
    !Array.isArray(scopes) ||
    !scopes.every((scope): scope is string => typeof scope === 'string') ||
    (apiKeyId !== undefined &&
      (typeof apiKeyId !== 'string' || apiKeyId.trim().length === 0))
  ) {
    return undefined;
  }
  return {
    ...(typeof apiKeyId === 'string' ? { apiKeyId } : {}),
    isApiKey,
    organizationId: expected.organizationId,
    scopes: [...scopes],
    userId: expected.userId,
  };
}

/**
 * The principal a tool call may bind a schedule to, or undefined for a system
 * turn. The captured principal must still describe the user and organization the
 * tool runs as: approval redemption or a workflow hop that swaps the executing
 * user leaves the schedule unbound instead of attributing it to the wrong actor.
 */
export function resolveToolSchedulePrincipal(context: {
  initiatingPrincipal?: AgentInitiatingPrincipal;
  isProactive?: boolean;
  organizationId: string;
  userId: string;
}): AgentInitiatingPrincipal | undefined {
  if (context.isProactive) return undefined;
  return projectAgentInitiatingPrincipal(context.initiatingPrincipal, context);
}
