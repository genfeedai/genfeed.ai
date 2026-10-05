import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import {
  memberUser,
  sessionOrganizationId,
  targetOrganizationId,
} from '@api-test/helpers/tenant-read.fixture';
import { WorkflowStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

describe('Workflow statistics tenant scope', () => {
  function setup() {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { status: WorkflowStatus.ACTIVE },
        { status: WorkflowStatus.ACTIVE },
      ]);
    const service = Object.create(
      WorkflowsService.prototype,
    ) as WorkflowsService;
    Object.assign(service, { prisma: { workflow: { findMany } } });
    return { findMany, service };
  }

  it('reads the entire target organization when caller ownership is omitted', async () => {
    const { findMany, service } = setup();
    expect(
      await service.getWorkflowStatistics(undefined, targetOrganizationId),
    ).toEqual([{ id: WorkflowStatus.ACTIVE, count: 2 }]);
    expect(findMany).toHaveBeenCalledWith({
      select: { status: true },
      where: { organizationId: targetOrganizationId, isDeleted: false },
    });
  });

  it('keeps member ownership and the session organization', async () => {
    const { findMany, service } = setup();
    await service.getWorkflowStatistics(
      memberUser.userId,
      sessionOrganizationId,
    );
    expect(findMany).toHaveBeenCalledWith({
      select: { status: true },
      where: {
        organizationId: sessionOrganizationId,
        isDeleted: false,
        userId: memberUser.userId,
      },
    });
  });
});
