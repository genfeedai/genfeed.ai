import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('McpApprovalsService', () => {
  const mcpApproval = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };

  const mockLogger: Partial<LoggerService> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockNotificationsPublisher: Partial<NotificationsPublisherService> = {
    publishNotification: vi.fn(),
  };

  let service: McpApprovalsService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new McpApprovalsService(
      { mcpApproval } as unknown as PrismaService,
      mockLogger as LoggerService,
      mockNotificationsPublisher as NotificationsPublisherService,
    );
  });

  describe('createPending', () => {
    it('creates a PENDING approval row and calls publishNotification', async () => {
      const fakeApproval = {
        id: 'approval-1',
        organizationId: 'org-1',
        userId: 'user-1',
        toolName: 'delete_file',
        arguments: { path: '/tmp/file.txt' },
        status: 'PENDING',
        createdAt: new Date(),
      };
      mcpApproval.create.mockResolvedValue(fakeApproval);
      (
        mockNotificationsPublisher.publishNotification as ReturnType<
          typeof vi.fn
        >
      ).mockResolvedValue(undefined);

      const result = await service.createPending(
        'org-1',
        'user-1',
        'delete_file',
        { path: '/tmp/file.txt' },
      );

      expect(mcpApproval.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          userId: 'user-1',
          toolName: 'delete_file',
          arguments: { path: '/tmp/file.txt' },
          status: 'PENDING',
        },
      });
      expect(
        mockNotificationsPublisher.publishNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          notification: expect.objectContaining({
            type: 'mcp_approval_pending',
            metadata: expect.objectContaining({
              toolName: 'delete_file',
            }),
          }) as unknown,
        }),
      );
      expect(result).toEqual(fakeApproval);
    });

    it('does NOT throw if publishNotification fails (swallows error)', async () => {
      const fakeApproval = {
        id: 'approval-2',
        organizationId: 'org-1',
        userId: 'user-1',
        toolName: 'write_file',
        arguments: {},
        status: 'PENDING',
        createdAt: new Date(),
      };
      mcpApproval.create.mockResolvedValue(fakeApproval);
      (
        mockNotificationsPublisher.publishNotification as ReturnType<
          typeof vi.fn
        >
      ).mockRejectedValue(new Error('Redis down'));

      await expect(
        service.createPending('org-1', 'user-1', 'write_file', {}),
      ).resolves.toEqual(fakeApproval);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('updates status to APPROVED and sets resolvedAt + result', async () => {
      const existing = {
        id: 'approval-3',
        organizationId: 'org-1',
        status: 'PENDING',
      };
      const updated = {
        ...existing,
        status: 'APPROVED',
        resolvedAt: expect.any(Date),
      };
      mcpApproval.findFirst.mockResolvedValue(existing);
      mcpApproval.update.mockResolvedValue(updated);

      const result = await service.resolve('approval-3', 'org-1', 'approve', {
        ok: true,
      });

      expect(mcpApproval.findFirst).toHaveBeenCalledWith({
        where: { id: 'approval-3', organizationId: 'org-1', isDeleted: false },
      });
      expect(mcpApproval.update).toHaveBeenCalledWith({
        where: { id: 'approval-3' },
        data: expect.objectContaining({
          status: 'APPROVED',
          resolvedAt: expect.any(Date),
          result: { ok: true },
        }),
      });
      expect(result).toEqual(updated);
    });

    it('updates status to DECLINED when decision is decline', async () => {
      const existing = {
        id: 'approval-4',
        organizationId: 'org-1',
        status: 'PENDING',
      };
      mcpApproval.findFirst.mockResolvedValue(existing);
      mcpApproval.update.mockResolvedValue({ ...existing, status: 'DECLINED' });

      await service.resolve('approval-4', 'org-1', 'decline');

      expect(mcpApproval.update).toHaveBeenCalledWith({
        where: { id: 'approval-4' },
        data: expect.objectContaining({ status: 'DECLINED' }),
      });
    });

    it('does not include result key when result is undefined', async () => {
      const existing = {
        id: 'approval-5',
        organizationId: 'org-1',
        status: 'PENDING',
      };
      mcpApproval.findFirst.mockResolvedValue(existing);
      mcpApproval.update.mockResolvedValue({ ...existing, status: 'APPROVED' });

      await service.resolve('approval-5', 'org-1', 'approve');

      const updateCall = mcpApproval.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateCall.data).not.toHaveProperty('result');
    });

    it('throws NotFoundException when approval not found or cross-org', async () => {
      mcpApproval.findFirst.mockResolvedValue(null);

      await expect(
        service.resolve('nonexistent', 'org-1', 'approve'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when status is not PENDING', async () => {
      const existing = {
        id: 'approval-6',
        organizationId: 'org-1',
        status: 'APPROVED',
      };
      mcpApproval.findFirst.mockResolvedValue(existing);

      await expect(
        service.resolve('approval-6', 'org-1', 'approve'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByOrganization', () => {
    it('queries with organizationId + isDeleted filter and desc ordering', async () => {
      mcpApproval.findMany.mockResolvedValue([]);

      await service.findByOrganization('org-1');

      expect(mcpApproval.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDeleted: false },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('includes status filter when provided', async () => {
      mcpApproval.findMany.mockResolvedValue([]);

      await service.findByOrganization('org-1', 'PENDING' as never);

      expect(mcpApproval.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDeleted: false, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
