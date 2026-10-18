import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { ReviewInboxDecisionService } from '@api/collections/review-inbox/services/review-inbox-decision.service';
import type { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import type { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const user: AuthenticatedUser = {
  brandId: 'brand-1',
  id: 'auth-user',
  organizationId: 'org-1',
  userId: 'user-1',
};

const fullAccess = {
  brandIds: undefined,
  canResolveMcpApprovals: true,
  canResolveWorkflowGates: true,
};

describe('ReviewInboxDecisionService', () => {
  const prisma = { workflowExecution: { findFirst: vi.fn() } };
  const brandAccess = { assert: vi.fn() };
  const workflowExecutor = { submitReviewGateApproval: vi.fn() };
  const mcpApprovals = { resolve: vi.fn() };
  const moduleAccess = { assertAccess: vi.fn() };
  let service: ReviewInboxDecisionService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.workflowExecution.findFirst.mockResolvedValue({
      workflow: { brandId: 'brand-1' },
      workflowId: 'wf-1',
    });
    workflowExecutor.submitReviewGateApproval.mockResolvedValue({
      approvedAt: '2026-10-03T00:00:00.000Z',
      status: 'approved',
    });
    mcpApprovals.resolve.mockResolvedValue({
      resolvedAt: new Date('2026-10-03T00:00:00.000Z'),
    });
    service = new ReviewInboxDecisionService(
      prisma as unknown as PrismaService,
      brandAccess as unknown as BrandAccessService,
      workflowExecutor as unknown as WorkflowExecutorService,
      mcpApprovals as unknown as McpApprovalsService,
      moduleAccess as unknown as OrganizationModuleAccessService,
    );
  });

  it('rejects ids it cannot route', async () => {
    await expect(
      service.decide(user, fullAccess, { decision: 'approve', itemId: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('resolves an MCP approval through the approvals service', async () => {
    const result = await service.decide(user, fullAccess, {
      decision: 'reject',
      itemId: 'mcp_approval:apr-1',
    });

    expect(mcpApprovals.resolve).toHaveBeenCalledWith(
      'apr-1',
      'org-1',
      'decline',
      undefined,
      user,
    );
    expect(result).toEqual({
      decision: 'reject',
      id: 'mcp_approval:apr-1',
      itemId: 'mcp_approval:apr-1',
      kind: 'mcp_approval',
      resolvedAt: '2026-10-03T00:00:00.000Z',
      status: 'rejected',
    });
  });

  it('forbids MCP approvals below admin', async () => {
    await expect(
      service.decide(
        user,
        { ...fullAccess, canResolveMcpApprovals: false },
        { decision: 'approve', itemId: 'mcp_approval:apr-1' },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mcpApprovals.resolve).not.toHaveBeenCalled();
  });

  it('approves a workflow gate through the executor after brand and module checks', async () => {
    const result = await service.decide(user, fullAccess, {
      decision: 'approve',
      itemId: 'workflow_review_gate:exec-1:gate:1',
    });

    expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'exec-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(brandAccess.assert).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
      'brand-1',
    );
    expect(moduleAccess.assertAccess).toHaveBeenCalledWith(
      'org-1',
      'automation',
    );
    expect(workflowExecutor.submitReviewGateApproval).toHaveBeenCalledWith(
      'wf-1',
      'exec-1',
      'user-1',
      'org-1',
      'gate:1',
      true,
      undefined,
    );
    expect(result).toMatchObject({
      kind: 'workflow_review_gate',
      resolvedAt: '2026-10-03T00:00:00.000Z',
      status: 'approved',
    });
  });

  it('rejects a gate without requiring the automation module', async () => {
    workflowExecutor.submitReviewGateApproval.mockResolvedValue({
      approvedAt: '2026-10-03T00:00:00.000Z',
      status: 'rejected',
    });

    await service.decide(user, fullAccess, {
      decision: 'reject',
      itemId: 'workflow_review_gate:exec-1:gate-1',
      reason: 'Off brand',
    });

    expect(moduleAccess.assertAccess).not.toHaveBeenCalled();
    expect(workflowExecutor.submitReviewGateApproval).toHaveBeenCalledWith(
      'wf-1',
      'exec-1',
      'user-1',
      'org-1',
      'gate-1',
      false,
      'Off brand',
    );
  });

  it('returns not found for an execution outside the organization', async () => {
    prisma.workflowExecution.findFirst.mockResolvedValue(null);

    await expect(
      service.decide(user, fullAccess, {
        decision: 'approve',
        itemId: 'workflow_review_gate:exec-9:gate-1',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(workflowExecutor.submitReviewGateApproval).not.toHaveBeenCalled();
  });

  it('forbids gate decisions for viewers without a reviewer role', async () => {
    await expect(
      service.decide(
        user,
        { ...fullAccess, canResolveWorkflowGates: false },
        { decision: 'approve', itemId: 'workflow_review_gate:exec-1:g' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
