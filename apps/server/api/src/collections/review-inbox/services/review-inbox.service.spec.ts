import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { ReviewInboxService } from '@api/collections/review-inbox/services/review-inbox.service';
import type {
  RolesGuard,
  RolesGuardRequest,
} from '@api/helpers/guards/roles/roles.guard';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const user: AuthenticatedUser = {
  brandId: 'brand-1',
  id: 'auth-user',
  organizationId: 'org-1',
  userId: 'user-1',
};

const ownerAccess = {
  brandIds: undefined,
  canResolveMcpApprovals: true,
  canResolveWorkflowGates: true,
};

function gateExecution(overrides: {
  id: string;
  brandId: string | null;
  strategyId?: string;
}) {
  return {
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    id: overrides.id,
    result: {
      metadata: {
        pendingApproval: {
          inputCaption: 'Launch day caption',
          inputMedia: 'https://cdn.example.com/a.png',
          nodeId: 'review-1',
          requestedAt: '2026-10-01T10:00:00.000Z',
          timeoutHours: 2,
        },
        ...(overrides.strategyId ? { strategyId: overrides.strategyId } : {}),
      },
    },
    workflow: {
      brandId: overrides.brandId,
      id: `wf-${overrides.id}`,
      label: 'Weekly posts',
    },
  };
}

describe('ReviewInboxService', () => {
  const prisma = {
    brand: { findMany: vi.fn() },
    mcpApproval: { findMany: vi.fn() },
    workflowExecution: { findMany: vi.fn() },
  };
  const brandAccess = { resolve: vi.fn() };
  const rolesGuard = { assertRoles: vi.fn() };
  let service: ReviewInboxService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.brand.findMany.mockResolvedValue([{ id: 'brand-1', label: 'Acme' }]);
    prisma.mcpApproval.findMany.mockResolvedValue([]);
    prisma.workflowExecution.findMany.mockResolvedValue([]);
    service = new ReviewInboxService(
      prisma as unknown as PrismaService,
      brandAccess as unknown as BrandAccessService,
      rolesGuard as unknown as RolesGuard,
    );
  });

  describe('resolveViewerAccess', () => {
    it('lets creators resolve gates but not MCP approvals', async () => {
      rolesGuard.assertRoles.mockImplementation(
        async (_request: RolesGuardRequest, roles: MemberRole[]) => {
          if (roles.includes(MemberRole.CREATOR)) return true;
          throw new ForbiddenException();
        },
      );
      brandAccess.resolve.mockResolvedValue({ brandIds: ['brand-1'] });

      await expect(
        service.resolveViewerAccess({ user } as RolesGuardRequest & {
          user: AuthenticatedUser;
        }),
      ).resolves.toEqual({
        brandIds: ['brand-1'],
        canResolveMcpApprovals: false,
        canResolveWorkflowGates: true,
      });
      expect(brandAccess.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
      );
    });

    it('does not hide unexpected role lookup failures', async () => {
      rolesGuard.assertRoles.mockRejectedValue(new Error('db down'));
      brandAccess.resolve.mockResolvedValue({});

      await expect(
        service.resolveViewerAccess({ user } as RolesGuardRequest & {
          user: AuthenticatedUser;
        }),
      ).rejects.toThrow('db down');
    });
  });

  describe('listPendingReviewGatesForMember', () => {
    it('lists only gates a creator may decide, inside their brands', async () => {
      brandAccess.resolve.mockResolvedValue({
        brandIds: ['brand-1'],
        role: MemberRole.CREATOR,
      });
      prisma.workflowExecution.findMany.mockResolvedValue([
        gateExecution({ brandId: 'brand-1', id: 'exec-1' }),
      ]);

      const items = await service.listPendingReviewGatesForMember({
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(items.map((item) => item.id)).toEqual([
        'workflow_review_gate:exec-1:review-1',
      ]);
      expect(prisma.mcpApproval.findMany).not.toHaveBeenCalled();
      expect(
        prisma.workflowExecution.findMany.mock.calls[0][0].where.workflow.is.OR,
      ).toEqual([{ brandId: { in: ['brand-1'] } }, { brandId: null }]);
    });

    it('returns nothing to a member who cannot decide gates', async () => {
      brandAccess.resolve.mockResolvedValue({
        brandIds: [],
        role: MemberRole.ANALYTICS,
      });
      prisma.workflowExecution.findMany.mockResolvedValue([
        gateExecution({ brandId: null, id: 'exec-1' }),
      ]);

      await expect(
        service.listPendingReviewGatesForMember({
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      ).resolves.toEqual([]);
    });
  });

  describe('listPending', () => {
    it('projects paused review gates with source, brand and expiry', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        gateExecution({ brandId: 'brand-1', id: 'exec-1', strategyId: 's-1' }),
        gateExecution({ brandId: null, id: 'exec-2' }),
        { ...gateExecution({ brandId: null, id: 'exec-3' }), result: {} },
      ]);

      const items = await service.listPending(
        { organizationId: 'org-1' },
        ownerAccess,
      );

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        brandId: 'brand-1',
        brandLabel: 'Acme',
        executionId: 'exec-1',
        expiresAt: '2026-10-01T12:00:00.000Z',
        id: 'workflow_review_gate:exec-1:review-1',
        isResolvable: true,
        kind: 'workflow_review_gate',
        preview: {
          caption: 'Launch day caption',
          mediaUrl: 'https://cdn.example.com/a.png',
        },
        reasons: [],
        source: 'agent',
        sourceLabel: 'Weekly posts',
        status: 'pending',
        workflowId: 'wf-exec-1',
      });
      expect(items[1]).toMatchObject({
        brandId: null,
        brandLabel: null,
        source: 'workflow',
      });
      const where = prisma.workflowExecution.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        isDeleted: false,
        NOT: {
          result: {
            equals: Prisma.AnyNull,
            path: ['metadata', 'pendingApproval', 'nodeId'],
          },
        },
        organizationId: 'org-1',
        status: 'RUNNING',
      });
    });

    it('lists pending MCP approvals for owners and admins without opaque ids', async () => {
      prisma.mcpApproval.findMany.mockResolvedValue([
        {
          arguments: {
            accessToken: 'secret-value',
            brandId: 'brand-1',
            caption: 'Hello world',
            platform: 'instagram',
          },
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
          id: 'apr-1',
          pricingQuote: null,
          toolName: 'publish_post',
        },
      ]);

      const items = await service.listPending(
        { organizationId: 'org-1' },
        ownerAccess,
      );

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        approvalId: 'apr-1',
        brandId: 'brand-1',
        brandLabel: 'Acme',
        id: 'mcp_approval:apr-1',
        kind: 'mcp_approval',
        preview: { caption: 'Hello world', mediaUrl: null },
        source: 'mcp_client',
        toolName: 'publish_post',
      });
      expect(items[0].actionSummary).toContain('Platform: instagram');
      expect(items[0].actionSummary).not.toContain('secret-value');
      expect(items[0].actionSummary).not.toContain('brand-1');
      expect(prisma.mcpApproval.findMany.mock.calls[0][0].where).toMatchObject({
        isDeleted: false,
        organizationId: 'org-1',
        status: 'PENDING',
      });
    });

    it('never lists MCP approvals for viewers below admin', async () => {
      await service.listPending(
        { organizationId: 'org-1' },
        { ...ownerAccess, canResolveMcpApprovals: false },
      );

      expect(prisma.mcpApproval.findMany).not.toHaveBeenCalled();
    });

    it('keeps a brand-restricted member inside their brands', async () => {
      prisma.mcpApproval.findMany.mockResolvedValue([
        {
          arguments: { brandId: 'brand-2' },
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
          id: 'apr-2',
          pricingQuote: null,
          toolName: 'publish_post',
        },
      ]);

      const items = await service.listPending(
        { brandId: 'brand-2', organizationId: 'org-1' },
        { ...ownerAccess, brandIds: ['brand-1'] },
      );

      expect(items).toEqual([]);
      const where = prisma.workflowExecution.findMany.mock.calls[0][0].where;
      expect(where.workflow.is.OR).toEqual([
        { brandId: { in: [] } },
        { brandId: null },
      ]);
    });

    it('sorts every source by request time', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        gateExecution({ brandId: null, id: 'exec-1' }),
      ]);
      prisma.mcpApproval.findMany.mockResolvedValue([
        {
          arguments: {},
          createdAt: new Date('2026-09-30T00:00:00.000Z'),
          id: 'apr-0',
          pricingQuote: null,
          toolName: 'publish_post',
        },
      ]);

      const items = await service.listPending(
        { organizationId: 'org-1' },
        ownerAccess,
      );

      expect(items.map((item) => item.id)).toEqual([
        'mcp_approval:apr-0',
        'workflow_review_gate:exec-1:review-1',
      ]);
    });
  });
});
