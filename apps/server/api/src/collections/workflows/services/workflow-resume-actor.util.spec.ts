import {
  requireRecordedWorkflowActor,
  WorkflowActorMembershipVerifier,
} from '@api/collections/workflows/services/workflow-resume-actor.util';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { describe, expect, it, vi } from 'vitest';

describe('requireRecordedWorkflowActor', () => {
  it.each([undefined, null, 42, {}, [], '', ' \t\n'])(
    'blocks an invalid recorded actor %j with the execution identity',
    (actor) => {
      expect(() =>
        requireRecordedWorkflowActor('execution-corrupt', actor),
      ).toThrow(
        'Workflow execution execution-corrupt has no recorded actor; resume is blocked.',
      );
    },
  );

  it.each(['opaque-user-id', ' recorded-actor ', SYSTEM_WORKFLOW_PRINCIPAL_ID])(
    'preserves a nonempty opaque actor byte for byte: %s',
    (actor) => {
      expect(requireRecordedWorkflowActor('execution-valid', actor)).toBe(
        actor,
      );
    },
  );
});

describe('WorkflowActorMembershipVerifier', () => {
  const build = (member: unknown) => {
    const findFirst = vi.fn().mockResolvedValue(member);
    return {
      findFirst,
      verifier: new WorkflowActorMembershipVerifier({
        member: { findFirst },
      } as never),
    };
  };

  it('scopes the lookup to an active, non-deleted member of the organization', async () => {
    const { findFirst, verifier } = build({ id: 'member-1' });
    await expect(verifier.isActiveMember('org-1', 'user-1')).resolves.toBe(
      true,
    );
    expect(findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: 'org-1',
        userId: 'user-1',
      },
    });
  });

  it('denies an actor with no active membership in the organization', async () => {
    const { verifier } = build(null);
    await expect(verifier.isActiveMember('org-1', 'removed')).resolves.toBe(
      false,
    );
  });

  it('denies a blank organization without querying', async () => {
    const { findFirst, verifier } = build({ id: 'member-1' });
    await expect(verifier.isActiveMember(' ', 'user-1')).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('treats the hidden system principal as a platform actor, not a member', async () => {
    const { findFirst, verifier } = build(null);
    await expect(
      verifier.isActiveMember('org-1', SYSTEM_WORKFLOW_PRINCIPAL_ID),
    ).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
