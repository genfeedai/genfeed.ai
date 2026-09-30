import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

const scope = {
  brandId: 'brand-1',
  contextVersion: 3,
  isLegacyFallback: false,
  isVersionExplicit: true,
  organizationId: 'org-1',
  source: 'explicit',
  threadId: 'thread-1',
  userId: 'user-1',
} as const;

describe('WorkflowExecutionAuthorizationService', () => {
  const prisma = {
    workflow: {
      findFirst: vi.fn(),
    },
  };
  const agentScopeContextService = {
    assertConsequentialBoundary: vi.fn(),
    assertResourceBrand: vi.fn(),
    prepareForTurn: vi.fn(),
  };
  const service = new WorkflowExecutionAuthorizationService(
    prisma as never,
    agentScopeContextService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    agentScopeContextService.prepareForTurn.mockResolvedValue({
      existingScope: scope,
    });
    prisma.workflow.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      id: 'workflow-1',
    });
  });

  it('preserves the existing direct-route authorization path without shell state', async () => {
    await expect(
      service.authorize({
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      }),
    ).resolves.toBeUndefined();

    expect(agentScopeContextService.prepareForTurn).not.toHaveBeenCalled();
    expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
  });

  it('requires the thread and context version as one authorization unit', async () => {
    await expect(
      service.authorize({
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(agentScopeContextService.prepareForTurn).not.toHaveBeenCalled();
  });

  it('validates stale context and exact workflow brand before execution', async () => {
    await expect(
      service.authorize({
        expectedContextVersion: 3,
        organizationId: 'org-1',
        requestedBrandId: 'brand-1',
        threadId: 'thread-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      }),
    ).resolves.toBe(scope);

    expect(agentScopeContextService.prepareForTurn).toHaveBeenCalledWith({
      expectedContextVersion: 3,
      organizationId: 'org-1',
      requestedBrandId: 'brand-1',
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(
      agentScopeContextService.assertConsequentialBoundary,
    ).toHaveBeenCalledWith(scope, 'workflow');
    expect(prisma.workflow.findFirst).toHaveBeenCalledWith({
      select: { brandId: true, id: true },
      where: {
        id: 'workflow-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(agentScopeContextService.assertResourceBrand).toHaveBeenCalledWith(
      scope,
      'brand-1',
      'workflow',
    );
  });

  it('rejects a workflow outside the validated thread brand before engine execution', async () => {
    agentScopeContextService.assertResourceBrand.mockImplementationOnce(() => {
      throw new ForbiddenException('outside scope');
    });

    await expect(
      service.authorize({
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
