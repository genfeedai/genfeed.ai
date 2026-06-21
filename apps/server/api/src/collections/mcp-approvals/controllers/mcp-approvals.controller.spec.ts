import { McpApprovalsController } from '@api/collections/mcp-approvals/controllers/mcp-approvals.controller';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUser = {
  id: 'user_123',
  publicMetadata: {
    brand: '507f1f77bcf86cd799439013',
    organization: 'org-abc',
    user: 'user-xyz',
  },
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
    attachResult: vi.fn(),
    createPending: vi.fn(),
    findByOrganization: vi.fn(),
    findOne: vi.fn(),
    resolve: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpApprovalsController],
      providers: [
        { provide: McpApprovalsService, useValue: mockServiceMethods },
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
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<McpApprovalsController>(McpApprovalsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
    it('passes status filter when provided', async () => {
      mockServiceMethods.findByOrganization.mockResolvedValue([fakeApproval]);

      const result = await controller.findAll(
        mockUser as never,
        'PENDING' as never,
      );

      expect(mockServiceMethods.findByOrganization).toHaveBeenCalledWith(
        'org-abc',
        'PENDING',
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'approval-1',
        status: 'PENDING',
      });
    });

    it('omits status filter when not provided', async () => {
      mockServiceMethods.findByOrganization.mockResolvedValue([]);

      await controller.findAll(mockUser as never, undefined);

      expect(mockServiceMethods.findByOrganization).toHaveBeenCalledWith(
        'org-abc',
        undefined,
      );
    });

    it('maps multiple approvals to response shape', async () => {
      const second = {
        ...fakeApproval,
        id: 'approval-2',
        toolName: 'write_file',
      };
      mockServiceMethods.findByOrganization.mockResolvedValue([
        fakeApproval,
        second,
      ]);

      const result = await controller.findAll(mockUser as never, undefined);

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
    it('attaches result then returns the refreshed approval, org-scoped', async () => {
      const withResult = {
        ...fakeApproval,
        status: 'APPROVED',
        result: { output: 42 },
      };
      mockServiceMethods.attachResult.mockResolvedValue(undefined);
      mockServiceMethods.findOne.mockResolvedValue(withResult);

      const result = await controller.attachResult(
        mockUser as never,
        'approval-1',
        { result: { output: 42 } },
      );

      expect(mockServiceMethods.attachResult).toHaveBeenCalledWith(
        'approval-1',
        'org-abc',
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

    it('throws NotFoundException when the approval is gone after the write', async () => {
      mockServiceMethods.attachResult.mockResolvedValue(undefined);
      mockServiceMethods.findOne.mockResolvedValue(null);

      await expect(
        controller.attachResult(mockUser as never, 'missing', {
          result: {},
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
