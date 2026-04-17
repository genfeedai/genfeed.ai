vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@genfeedai/prisma', () => ({
  PrismaClient: class {},
}));

import type { AgentSessionBindingDocument } from '@api/services/agent-threading/schemas/agent-session-binding.schema';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { Effect } from 'effect';

describe('AgentRuntimeSessionService', () => {
  let service: AgentRuntimeSessionService;
  let logger: vi.Mocked<LoggerService>;

  const threadId = 'thread-cuid-1';
  const organizationId = 'org-cuid-1';
  const runId = 'run-cuid-1';

  const mockSnapshotRow = {
    id: 'snapshot-cuid-1',
    organizationId,
    threadId,
    isDeleted: false,
    data: {
      sessionBinding: {
        status: 'active',
        lastSeenAt: new Date().toISOString(),
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    agentThreadSnapshot: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRuntimeSessionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AgentRuntimeSessionService>(
      AgentRuntimeSessionService,
    );
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertBinding', () => {
    it('should expose an Effect-based upsert path', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      const result = await Effect.runPromise(
        service.upsertBindingEffect({
          organizationId,
          status: 'active',
          threadId,
        }),
      );

      expect(result).not.toBeNull();
      expect((result as AgentSessionBindingDocument).threadId).toBe(threadId);
      expect(mockPrisma.agentThreadSnapshot.create).toHaveBeenCalledTimes(1);
    });

    it('should create a new snapshot when none exists', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      const result = await service.upsertBinding({
        organizationId,
        status: 'active',
        threadId,
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.agentThreadSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId,
            threadId,
            data: expect.objectContaining({
              sessionBinding: expect.objectContaining({ status: 'active' }),
            }),
          }),
        }),
      );
    });

    it('should update an existing snapshot when one exists', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(
        mockSnapshotRow,
      );
      const updatedRow = {
        ...mockSnapshotRow,
        data: {
          sessionBinding: {
            status: 'idle',
            lastSeenAt: new Date().toISOString(),
          },
        },
      };
      mockPrisma.agentThreadSnapshot.update.mockResolvedValue(updatedRow);

      const result = await service.upsertBinding({
        organizationId,
        status: 'idle',
        threadId,
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.agentThreadSnapshot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockSnapshotRow.id },
        }),
      );
    });

    it('should include optional model when provided', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue({
        ...mockSnapshotRow,
        data: {
          sessionBinding: {
            model: 'gpt-4o',
            status: 'active',
            lastSeenAt: new Date().toISOString(),
          },
        },
      });

      await service.upsertBinding({
        model: 'gpt-4o',
        organizationId,
        status: 'active',
        threadId,
      });

      expect(mockPrisma.agentThreadSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: expect.objectContaining({
              sessionBinding: expect.objectContaining({ model: 'gpt-4o' }),
            }),
          }),
        }),
      );
    });

    it('should include resumeCursor when provided', async () => {
      const resumeCursor = { index: 3, step: 'generate' };
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      await service.upsertBinding({
        organizationId,
        resumeCursor,
        status: 'active',
        threadId,
      });

      expect(mockPrisma.agentThreadSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: expect.objectContaining({
              sessionBinding: expect.objectContaining({ resumeCursor }),
            }),
          }),
        }),
      );
    });

    it('should return null when snapshot returns null-like', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(null);

      const result = await service.upsertBinding({
        organizationId,
        status: 'active',
        threadId,
      });

      expect(result).toBeNull();
    });

    it('should propagate errors from prisma', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.upsertBinding({ organizationId, status: 'active', threadId }),
      ).rejects.toThrow('DB error');
    });
  });

  describe('getBinding', () => {
    it('should expose an Effect-based get path', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(
        mockSnapshotRow,
      );

      const result = await Effect.runPromise(
        service.getBindingEffect(threadId, organizationId),
      );

      expect(result).not.toBeNull();
      expect(mockPrisma.agentThreadSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId, threadId }),
        }),
      );
    });

    it('should return an existing binding', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(
        mockSnapshotRow,
      );

      const result = await service.getBinding(threadId, organizationId);

      expect(result).not.toBeNull();
      expect((result as AgentSessionBindingDocument).threadId).toBe(threadId);
    });

    it('should return null when binding does not exist', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getBinding(threadId, organizationId);

      expect(result).toBeNull();
    });
  });

  describe('markCancelled', () => {
    it('should upsert with cancelled status', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue({
        ...mockSnapshotRow,
        data: {
          sessionBinding: {
            status: 'cancelled',
            lastSeenAt: new Date().toISOString(),
          },
        },
      });

      await service.markCancelled(threadId, organizationId, runId);

      expect(mockPrisma.agentThreadSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: expect.objectContaining({
              sessionBinding: expect.objectContaining({ status: 'cancelled' }),
            }),
          }),
        }),
      );
    });

    it('should log a warning after cancellation', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      await service.markCancelled(threadId, organizationId, runId);

      expect(logger.warn).toHaveBeenCalledWith(
        'Agent runtime session marked cancelled',
        expect.objectContaining({ organizationId, runId, threadId }),
      );
    });

    it('should work without a runId', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      await service.markCancelled(threadId, organizationId);

      expect(mockPrisma.agentThreadSnapshot.create).toHaveBeenCalled();
    });

    it('should expose an Effect-based cancel path and log the transition', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      await Effect.runPromise(
        service.markCancelledEffect(threadId, organizationId, runId),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Agent runtime session marked cancelled',
        {
          organizationId,
          runId,
          threadId,
        },
      );
    });
  });
});
