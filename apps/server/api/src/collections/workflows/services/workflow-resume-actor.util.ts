import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

/** Require the persisted run actor without changing its opaque identity. */
export function requireRecordedWorkflowActor(
  executionId: string,
  userId: unknown,
): string {
  if (typeof userId !== 'string' || !/\S/.test(userId)) {
    throw new Error(
      `Workflow execution ${executionId} has no recorded actor; resume is blocked.`,
    );
  }
  return userId;
}

const REVOKED_WORKFLOW_ACTOR_REASON =
  'its recorded actor is no longer an active member of the organization.';

/** Reason recorded on an execution whose recorded actor lost organization access. */
export function buildRevokedWorkflowActorMessage(executionId: string): string {
  return `Workflow execution ${executionId} was not resumed: ${REVOKED_WORKFLOW_ACTOR_REASON}`;
}

/** Whether a recorded execution error is the deliberate revoked-actor refusal. */
export function isRevokedWorkflowActorMessage(message: unknown): boolean {
  return (
    typeof message === 'string' &&
    message.startsWith('Workflow execution ') &&
    message.endsWith(` was not resumed: ${REVOKED_WORKFLOW_ACTOR_REASON}`)
  );
}

/**
 * Resume paths continue as the actor recorded on the execution row, long after
 * the run started. Membership is re-checked at resume time so a removed member
 * cannot keep spending the organization's credits or writing under their
 * identity. The hidden system principal is a platform identity, not a member.
 */
export class WorkflowActorMembershipVerifier {
  constructor(private readonly prisma: Pick<PrismaService, 'member'>) {}

  async isActiveMember(
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    if (userId === SYSTEM_WORKFLOW_PRINCIPAL_ID) {
      return true;
    }
    if (!/\S/.test(organizationId)) {
      return false;
    }
    const member = await this.prisma.member.findFirst({
      select: { id: true },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId,
        userId,
      },
    });
    return member !== null;
  }
}
