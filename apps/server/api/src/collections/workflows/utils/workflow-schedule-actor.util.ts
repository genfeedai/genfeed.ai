import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import {
  parseWorkflowActor,
  toWorkflowActor,
  type WorkflowInitiatingActor,
} from '@api/authorization/brand-access/workflow-actor.util';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';

/**
 * The authenticated principal that configures a workflow schedule. It is always
 * derived from the request's authenticated user or API key, never from request
 * input JSON, and is validated into a `WorkflowInitiatingActor` only when a
 * schedule is actually bound (pausing or clearing never needs one).
 */
export type WorkflowSchedulePrincipal = BrandAccessActor;

type AuthenticatedPrincipalSource = Pick<
  AuthenticatedUser,
  'apiKeyId' | 'id' | 'isApiKey' | 'organizationId' | 'scopes' | 'userId'
>;

export function toWorkflowSchedulePrincipal(
  user: AuthenticatedPrincipalSource,
): WorkflowSchedulePrincipal {
  return {
    apiKeyId: user.apiKeyId,
    isApiKey: user.isApiKey ?? false,
    organizationId: user.organizationId,
    scopes: user.scopes ?? [],
    userId: user.userId ?? user.id,
  };
}

/**
 * The actor a saved schedule is bound to: the configuring principal when the
 * schedule is set and enabled, otherwise `null` (cleared). A principal from
 * another organization is rejected instead of being re-labelled.
 */
export function resolveScheduleInitiatingActor(input: {
  isEnabled: boolean | null | undefined;
  organizationId: string;
  principal?: WorkflowSchedulePrincipal | null;
  schedule: string | null | undefined;
}): WorkflowInitiatingActor | null {
  const { isEnabled, organizationId, principal, schedule } = input;
  if (!schedule || isEnabled !== true || !principal) {
    return null;
  }
  // Re-run the persisted-shape parser so a foreign-organization principal can
  // never be stored on this organization's workflow.
  return parseWorkflowActor(toWorkflowActor(principal), organizationId);
}

/** Prisma write value: the serialized actor, or SQL NULL to clear the binding. */
export function toScheduleInitiatingActorWrite(
  actor: WorkflowInitiatingActor | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return actor ? toPrismaJson(actor) : Prisma.DbNull;
}
