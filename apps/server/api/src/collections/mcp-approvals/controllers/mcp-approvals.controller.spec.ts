import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { McpApprovalsController } from '@api/collections/mcp-approvals/controllers/mcp-approvals.controller';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUser = {
  id: 'user_123',
  brandId: testId('brand'),
  organizationId: 'org-abc',
  userId: 'user-xyz',
};

const fakeApproval = {
  id: 'approval-1',
  status: 'PENDING',
  toolName: 'delete_file',
  arguments: { path: '/tmp/test.txt' },
  result: null,
  resolvedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  organizationId: 'org-abc',
  userId: 'user-xyz',
  isDeleted: false,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('McpApprovalsController', () => {
  let controller: McpApprovalsController;

  const mockServiceMethods = {
    attachResultForActor: vi.fn(),
    claimExecutionForActor: vi.fn(),
    createPending: vi.fn(),
    findByOrganization: vi.fn(),
    findOne: vi.fn(),
    findStatusForActor: vi.fn(),
    findPricingForActor: vi.fn(),
    resolve: vi.fn(),
  };
  const rolesGuard = { assertRoles: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpApprovalsController],
      providers: [
        { provide: McpApprovalsService, useValue: mockServiceMethods },
        { provide: RolesGuard, useValue: rolesGuard },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<McpApprovalsController>(McpApprovalsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('serializes only the authorized consent price and model without tariff evidence', async () => {
    mockServiceMethods.findPricingForActor.mockResolvedValue({
      id: 'approval-1',
      estimatedCredits: 2,
      modelKey: 'flux-schnell',
      quoteStatus: 'available',
      pricingQuote: { private: true },
      arguments: { secret: 'hidden' },
    });
    const result = await controller.pricing(mockUser as never, 'approval-1');
    expect(mockServiceMethods.findPricingForActor).toHaveBeenCalledWith(
      'approval-1',
      mockUser,
    );
    expect(result.data).toMatchObject({
      id: 'approval-1',
      attributes: {
        estimatedCredits: 2,
        modelKey: 'flux-schnell',
        quoteStatus: 'available',
      },
    });
    expect(JSON.stringify(result)).not.toContain('pricingQuote');
    expect(JSON.stringify(result)).not.toContain('hidden');
  });

  it('serializes only minimal status after scoped authorization', async () => {
    mockServiceMethods.findStatusForActor.mockResolvedValue(fakeApproval);
    const result = await controller.status(mockUser as never, 'approval-1');
    expect(mockServiceMethods.findStatusForActor).toHaveBeenCalledWith(
      'approval-1',
      mockUser,
    );
    expect(result.data).toMatchObject({
      id: 'approval-1',
      attributes: { status: 'PENDING', toolName: 'delete_file' },
    });
    const serialized = JSON.stringify(result);
    for (const field of [
      'arguments',
      'result',
      'organizationId',
      'userId',
      'isDeleted',
      'updatedAt',
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
    expect(serialized).not.toContain('/tmp/test.txt');
  });

  describe('POST /', () => {
    it('calls createPending and returns wrapped response shape', async () => {
      mockServiceMethods.createPending.mockResolvedValue(fakeApproval);

      const result = await controller.create(mockUser as never, {
        toolName: 'delete_file',
        arguments: { path: '/tmp/test.txt' },
      });

      expect(mockServiceMethods.createPending).toHaveBeenCalledWith(
        'org-abc',
        'user-xyz',
        'delete_file',
        { path: '/tmp/test.txt' },
      );
      expect(result).toEqual({
        data: expect.objectContaining({
          id: 'approval-1',
          status: 'PENDING',
          toolName: 'delete_file',
          arguments: { path: '/tmp/test.txt' },
        }),
      });
    });
  });

  describe('GET /', () => {
    const page = (docs: unknown[], totalDocs = docs.length) => ({
      docs,
      hasNextPage: false,
      hasPrevPage: false,
      limit: 20,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs,
      totalPages: Math.max(1, Math.ceil(totalDocs / 20)),
    });

    it('passes the page query and status filter to the service', async () => {
      mockServiceMethods.findByOrganization.mockResolvedValue(
        page([fakeApproval]),
      );
      const query = { limit: 20, page: 1, status: 'PENDING' };

      const result = await controller.findAll(
        mockUser as never,
        query as never,
      );

      expect(mockServiceMethods.findByOrganization).toHaveBeenCalledWith(
        'org-abc',
        query,
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'approval-1',
        status: 'PENDING',
      });
    });

    it('returns pagination links for the page', async () => {
      mockServiceMethods.findByOrganization.mockResolvedValue({
        ...page([], 45),
        hasNextPage: true,
        nextPage: 2,
        totalPages: 3,
      });

      const result = await controller.findAll(
        mockUser as never,
        {
          limit: 20,
          page: 1,
        } as never,
      );

      expect(result.links.pagination).toMatchObject({
        hasNext: true,
        limit: 20,
        page: 1,
        pages: 3,
        total: 45,
      });
    });

    it('maps multiple approvals to response shape', async () => {
      const second = {
        ...fakeApproval,
        id: 'approval-2',
        toolName: 'write_file',
      };
      mockServiceMethods.findByOrganization.mockResolvedValue(
        page([fakeApproval, second]),
      );

      const result = await controller.findAll(
        mockUser as never,
        {
          limit: 20,
          page: 1,
        } as never,
      );

      expect(result.data).toHaveLength(2);
      expect(result.data[1]).toMatchObject({
        id: 'approval-2',
        toolName: 'write_file',
      });
    });
  });

  describe('GET /:id', () => {
    it('returns single approval response shape', async () => {
      mockServiceMethods.findOne.mockResolvedValue(fakeApproval);

      const result = await controller.findOne(mockUser as never, 'approval-1');

      expect(mockServiceMethods.findOne).toHaveBeenCalledWith({
        id: 'approval-1',
        organizationId: 'org-abc',
        isDeleted: false,
      });
      expect(result).toEqual({
        data: expect.objectContaining({ id: 'approval-1' }),
      });
    });

    it('throws NotFoundException when approval not found', async () => {
      mockServiceMethods.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockUser as never, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /:id/resolve', () => {
    it('calls service.resolve with correct args and returns response', async () => {
      const resolved = {
        ...fakeApproval,
        status: 'APPROVED',
        resolvedAt: new Date(),
      };
      mockServiceMethods.resolve.mockResolvedValue(resolved);

      const result = await controller.resolve(mockUser as never, 'approval-1', {
        decision: 'approve',
        result: { ok: true },
      });

      expect(mockServiceMethods.resolve).toHaveBeenCalledWith(
        'approval-1',
        'org-abc',
        'approve',
        { ok: true },
        expect.objectContaining({
          organizationId: 'org-abc',
          userId: 'user-xyz',
        }),
      );
      expect(result.data).toMatchObject({
        id: 'approval-1',
        status: 'APPROVED',
      });
    });

    it('propagates BadRequestException from service when already resolved', async () => {
      mockServiceMethods.resolve.mockRejectedValue(
        new BadRequestException('Approval already resolved'),
      );

      await expect(
        controller.resolve(mockUser as never, 'approval-1', {
          decision: 'approve',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /:id/result', () => {
    const request = { body: {}, params: {} } as never;

    it('attaches result then returns the refreshed approval, org-scoped', async () => {
      rolesGuard.assertRoles.mockResolvedValue(true);
      const withResult = {
        ...fakeApproval,
        status: 'APPROVED',
        result: { output: 42 },
      };
      mockServiceMethods.attachResultForActor.mockResolvedValue(undefined);
      mockServiceMethods.findOne.mockResolvedValue(withResult);

      const result = await controller.attachResult(
        request,
        mockUser as never,
        'approval-1',
        { result: { output: 42 } },
      );

      expect(mockServiceMethods.attachResultForActor).toHaveBeenCalledWith(
        'approval-1',
        'org-abc',
        'user-xyz',
        true,
        { output: 42 },
      );
      expect(mockServiceMethods.findOne).toHaveBeenCalledWith({
        id: 'approval-1',
        organizationId: 'org-abc',
        isDeleted: false,
      });
      expect(result.data).toMatchObject({
        id: 'approval-1',
        result: { output: 42 },
      });
    });

    it('lets a requester below admin record the outcome of their own run', async () => {
      rolesGuard.assertRoles.mockRejectedValue(new Error('Roles - Forbidden'));
      mockServiceMethods.attachResultForActor.mockResolvedValue(undefined);
      mockServiceMethods.findOne.mockResolvedValue(fakeApproval);

      await controller.attachResult(request, mockUser as never, 'approval-1', {
        result: { output: 1 },
      });

      expect(mockServiceMethods.attachResultForActor).toHaveBeenCalledWith(
        'approval-1',
        'org-abc',
        'user-xyz',
        false,
        { output: 1 },
      );
    });

    it('throws NotFoundException when the approval is gone after the write', async () => {
      rolesGuard.assertRoles.mockResolvedValue(true);
      mockServiceMethods.attachResultForActor.mockResolvedValue(undefined);
      mockServiceMethods.findOne.mockResolvedValue(null);

      await expect(
        controller.attachResult(request, mockUser as never, 'missing', {
          result: {},
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /:id/claim', () => {
    const request = { body: {}, params: {} } as never;

    it('lets an owner or admin claim any approval of the organization', async () => {
      rolesGuard.assertRoles.mockResolvedValue(true);
      mockServiceMethods.claimExecutionForActor.mockResolvedValue(true);

      const result = await controller.claim(
        request,
        mockUser as never,
        'approval-1',
      );

      expect(mockServiceMethods.claimExecutionForActor).toHaveBeenCalledWith(
        'approval-1',
        'org-abc',
        'user-xyz',
        true,
      );
      expect(result).toEqual({ data: { id: 'approval-1', isClaimed: true } });
    });

    it('falls back to requester-only redemption for other members', async () => {
      rolesGuard.assertRoles.mockRejectedValue(new Error('Roles - Forbidden'));
      mockServiceMethods.claimExecutionForActor.mockResolvedValue(false);

      const result = await controller.claim(
        request,
        mockUser as never,
        'approval-1',
      );

      expect(mockServiceMethods.claimExecutionForActor).toHaveBeenCalledWith(
        'approval-1',
        'org-abc',
        'user-xyz',
        false,
      );
      expect(result.data.isClaimed).toBe(false);
    });
  });
});
