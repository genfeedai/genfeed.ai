import {
  parseWorkflowActor,
  toWorkflowActor,
} from '@api/authorization/brand-access/workflow-actor.util';
import {
  toScheduleInitiatingActorWrite,
  type WorkflowSchedulePrincipal,
} from '@api/collections/workflows/utils/workflow-schedule-actor.util';
import { Prisma } from '@genfeedai/prisma';

/**
 * A strategy runs autonomous turns (proactive, campaign, cadence) only while it
 * is active and enabled. `isEnabled` lives in the config JSON, `isActive` is a
 * column; both must allow the run.
 */
export function isStrategyEnabled(
  isActive: boolean | null | undefined,
  config: Record<string, unknown> | null | undefined,
): boolean {
  return isActive === true && config?.isEnabled !== false;
}

/**
 * The write for `AgentStrategy.scheduleInitiatingActor` that a strategy save
 * implies, or `undefined` when the stored actor must stay as it is.
 *
 * - A strategy that is not active and enabled loses its actor, so no earlier
 *   person's authority survives a disable.
 * - An active, enabled strategy saved by an authenticated principal of its own
 *   organization is bound to that principal. A principal from another
 *   organization is ignored, never re-labelled.
 * - An active, enabled strategy saved without a principal (a worker, the
 *   scheduler, an internal counter update) keeps whatever actor it has.
 *
 * The principal is always derived from the request's authenticated user or API
 * key by the controller. It is never read from request input.
 */
export function resolveStrategyScheduleActorWrite(input: {
  config: Record<string, unknown> | null | undefined;
  isActive: boolean | null | undefined;
  organizationId: string;
  principal?: WorkflowSchedulePrincipal | null;
}): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  const { config, isActive, organizationId, principal } = input;
  if (!isStrategyEnabled(isActive, config)) {
    return Prisma.DbNull;
  }
  // A cross-tenant operator (a super admin editing another organization's
  // strategy) never becomes that organization's actor: the stored actor stays.
  if (!principal || principal.organizationId !== organizationId) {
    return undefined;
  }
  // Re-run the persisted-shape parser: only the authenticated fields survive.
  return toScheduleInitiatingActorWrite(
    parseWorkflowActor(toWorkflowActor(principal), organizationId),
  );
}
