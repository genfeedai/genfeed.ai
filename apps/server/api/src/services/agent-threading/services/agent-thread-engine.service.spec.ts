vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@genfeedai/prisma', () => ({
  PrismaClient: class {},
}));
vi.mock(
  '@api/collections/agent-threads/services/agent-threads.service',
  () => ({
    AgentThreadsService: class {},
  }),
);
vi.mock(
  '@api/collections/agent-memories/services/agent-memories.service',
  () => ({
    AgentMemoriesService: class {},
  }),
);

import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Effect } from 'effect';

import { AgentThreadEngineService } from './agent-thread-engine.service';

// Valid 24-char hex strings for ObjectId validation.
const orgId = 'a'.repeat(24);
const threadId = 'b'.repeat(24);
const commandId = 'cmd-abc';

const mockThread = {
  _id: threadId,
  source: 'discord',
  status: 'active',
  title: 'Test thread',
};

const mockEventRow = {
  id: 'event-id-1',
  commandId,
  isDeleted: false,
  organizationId: orgId,
  runId: 'run-1',
  sequence: 1,
  threadId,
  type: 'work.started',
  data: { occurredAt: new Date().toISOString(), payload: {}, metadata: {} },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSnapshotRow = {
  id: 'snapshot-id-1',
  isDeleted: false,
  organizationId: orgId,
  threadId,
  data: {
    lastSequence: 1,
    memorySummaryRefs: [],
    pendingApprovals: [],
    pendingInputRequests: [],
    source: 'discord',
    threadStatus: 'active',
    timeline: [],
    title: 'Test thread',
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AgentThreadEngineService', () => {
  let service: AgentThreadEngineService;
  let mockPrisma: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
  let agentThreadsService: vi.Mocked<Pick<AgentThreadsService, 'findOne'>>;
  let agentMemoriesService: vi.Mocked<
    Pick<AgentMemoriesService, 'createMemory'>
  >;
  let runtimeSessionService: vi.Mocked<
    Pick<
      AgentRuntimeSessionService,
      | 'upsertBinding'
      | 'markCancelled'
      | 'upsertBindingEffect'
      | 'markCancelledEffect'
    >
  >;
  let projectorService: vi.Mocked<
    Pick<AgentThreadProjectorService, 'applyEvent'>
  >;
  let loggerService: vi.Mocked<Pick<LoggerService, 'log' | 'error' | 'warn'>>;

  beforeEach(async () => {
    mockPrisma = {
      agentThreadEvent: {
        create: vi.fn().mockResolvedValue(mockEventRow),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([mockEventRow]),
      },
      agentThreadSnapshot: {
        create: vi.fn().mockResolvedValue(mockSnapshotRow),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(mockSnapshotRow),
        update: vi.fn().mockResolvedValue(mockSnapshotRow),
      },
    };

    agentThreadsService = { findOne: vi.fn().mockResolvedValue(mockThread) };
    agentMemoriesService = {
      createMemory: vi
        .fn()
        .mockResolvedValue({ _id: 'mem-id-1', id: 'mem-id-1' }),
    };
    runtimeSessionService = {
      markCancelled: vi.fn().mockResolvedValue(undefined),
      markCancelledEffect: vi.fn(() => Effect.void),
      upsertBinding: vi.fn().mockResolvedValue(undefined),
      upsertBindingEffect: vi.fn(() => Effect.void),
    };
    projectorService = {
      applyEvent: vi.fn().mockReturnValue({ timeline: [] }),
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentThreadEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AgentThreadsService, useValue: agentThreadsService },
        { provide: AgentMemoriesService, useValue: agentMemoriesService },
        {
          provide: AgentRuntimeSessionService,
          useValue: runtimeSessionService,
        },
        { provide: AgentThreadProjectorService, useValue: projectorService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<AgentThreadEngineService>(AgentThreadEngineService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── appendEvent ──────────────────────────────────────────────────────────────
  describe('appendEvent', () => {
    const params = {
      commandId,
      organizationId: orgId,
      threadId,
      type: 'work.started' as const,
    };

    it('creates a new event when none exists', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      const result = await service.appendEvent(params);
      expect(mockPrisma.agentThreadEvent.create).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.type).toBe('work.started');
    });

    it('exposes an Effect-based append path', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      const result = await Effect.runPromise(service.appendEventEffect(params));

      expect(result).toBeDefined();
      expect(mockPrisma.agentThreadEvent.create).toHaveBeenCalled();
    });

    it('returns existing event when duplicate commandId+type found', async () => {
      mockPrisma.agentThreadEvent.findFirst.mockResolvedValue(mockEventRow);

      const result = await service.appendEvent(params);
      expect(mockPrisma.agentThreadEvent.create).not.toHaveBeenCalled();
      expect(result.commandId).toBe(commandId);
    });

    it('throws BadRequestException for invalid threadId', async () => {
      await expect(
        service.appendEvent({ ...params, threadId: 'not-an-objectid' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid organizationId', async () => {
      await expect(
        service.appendEvent({ ...params, organizationId: 'bad-id' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when thread not found', async () => {
      agentThreadsService.findOne.mockResolvedValue(null);
      await expect(service.appendEvent(params)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when snapshot allocation fails', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(null);
      await expect(service.appendEvent(params)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calls runtimeSessionService.upsertBindingEffect for work.started event', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);
      mockPrisma.agentThreadSnapshot.findUnique.mockResolvedValue(
        mockSnapshotRow,
      );

      await service.appendEvent({
        ...params,
        runId: 'run-2',
        type: 'work.started',
      });
      expect(runtimeSessionService.upsertBindingEffect).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running', threadId }),
      );
    });
  });

  // ── listEvents ────────────────────────────────────────────────────────────────
  describe('listEvents', () => {
    it('exposes an Effect-based list path', async () => {
      const result = await Effect.runPromise(
        service.listEventsEffect(threadId, orgId),
      );

      expect(result).toBeDefined();
      expect(mockPrisma.agentThreadEvent.findMany).toHaveBeenCalled();
    });

    it('returns sorted events', async () => {
      const result = await service.listEvents(threadId, orgId);
      expect(mockPrisma.agentThreadEvent.findMany).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    it('applies afterSequence filter when provided', async () => {
      await service.listEvents(threadId, orgId, 5);
      expect(mockPrisma.agentThreadEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sequence: expect.objectContaining({ gt: 5 }),
          }),
        }),
      );
    });

    it('throws BadRequestException for invalid threadId', async () => {
      await expect(service.listEvents('bad', orgId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── getSnapshot ───────────────────────────────────────────────────────────────
  describe('getSnapshot', () => {
    it('exposes an Effect-based snapshot path', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(
        mockSnapshotRow,
      );

      const result = await Effect.runPromise(
        service.getSnapshotEffect(threadId, orgId),
      );

      expect(result).toBeDefined();
    });

    it('creates snapshot when none exists', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);
      const result = await service.getSnapshot(threadId, orgId);
      expect(mockPrisma.agentThreadSnapshot.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('returns existing snapshot', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(
        mockSnapshotRow,
      );
      const result = await service.getSnapshot(threadId, orgId);
      expect(mockPrisma.agentThreadSnapshot.create).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ── resolveInputRequest ───────────────────────────────────────────────────────
  describe('resolveInputRequest', () => {
    const pendingRequest = {
      requestId: 'req-1',
      status: 'pending',
      prompt: 'What is your answer?',
      options: [],
    };

    it('resolves a pending input request', async () => {
      const snapshotWithRequest = {
        ...mockSnapshotRow,
        data: { ...mockSnapshotRow.data, inputRequests: [pendingRequest] },
      };
      mockPrisma.agentThreadSnapshot.findFirst
        .mockResolvedValueOnce(snapshotWithRequest) // resolveInputRequestEffect
        .mockResolvedValueOnce(null); // appendEvent's snapshot lookup
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);
      mockPrisma.agentThreadSnapshot.update.mockResolvedValue({
        ...snapshotWithRequest,
        data: {
          ...snapshotWithRequest.data,
          inputRequests: [
            { ...pendingRequest, status: 'resolved', answer: '42' },
          ],
        },
      });

      const result = await service.resolveInputRequest({
        answer: '42',
        organizationId: orgId,
        requestId: 'req-1',
        threadId,
        userId: orgId,
      });
      expect(result.status).toBe('resolved');
      expect(mockPrisma.agentThreadSnapshot.update).toHaveBeenCalled();
    });

    it('exposes an Effect-based input resolution path', async () => {
      const snapshotWithRequest = {
        ...mockSnapshotRow,
        data: { ...mockSnapshotRow.data, inputRequests: [pendingRequest] },
      };
      mockPrisma.agentThreadSnapshot.findFirst
        .mockResolvedValueOnce(snapshotWithRequest)
        .mockResolvedValueOnce(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);
      mockPrisma.agentThreadSnapshot.update.mockResolvedValue({
        ...snapshotWithRequest,
        data: {
          ...snapshotWithRequest.data,
          inputRequests: [
            { ...pendingRequest, status: 'resolved', answer: '42' },
          ],
        },
      });

      const result = await Effect.runPromise(
        service.resolveInputRequestEffect({
          answer: '42',
          organizationId: orgId,
          requestId: 'req-1',
          threadId,
          userId: orgId,
        }),
      );

      expect(result.status).toBe('resolved');
    });

    it('throws NotFoundException when snapshot not found', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      await expect(
        service.resolveInputRequest({
          answer: 'x',
          organizationId: orgId,
          requestId: 'missing',
          threadId,
          userId: orgId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when request not in pending state', async () => {
      const snapshotWithoutRequest = {
        ...mockSnapshotRow,
        data: { ...mockSnapshotRow.data, inputRequests: [] },
      };
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(
        snapshotWithoutRequest,
      );
      await expect(
        service.resolveInputRequest({
          answer: 'x',
          organizationId: orgId,
          requestId: 'missing',
          threadId,
          userId: orgId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── recordProfileSnapshot ─────────────────────────────────────────────────────
  describe('recordProfileSnapshot', () => {
    it('exposes an Effect-based profile snapshot path', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(
        mockSnapshotRow,
      );
      mockPrisma.agentThreadSnapshot.update.mockResolvedValue({
        ...mockSnapshotRow,
        data: {
          ...mockSnapshotRow.data,
          profileSnapshot: { agentType: 'default' },
        },
      });

      const result = await Effect.runPromise(
        service.recordProfileSnapshotEffect(threadId, orgId, {
          agentType: 'default',
        }),
      );

      expect(result).toBeDefined();
      expect(mockPrisma.agentThreadSnapshot.update).toHaveBeenCalled();
    });
  });

  // ── recordMemoryFlush ─────────────────────────────────────────────────────────
  describe('recordMemoryFlush', () => {
    it('exposes an Effect-based memory flush path', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      const result = await Effect.runPromise(
        service.recordMemoryFlushEffect(
          threadId,
          orgId,
          orgId,
          'Summary of session',
          ['tag-1'],
        ),
      );

      expect(result).toBe('mem-id-1');
      expect(agentMemoriesService.createMemory).toHaveBeenCalled();
    });

    it('creates memory and appends event', async () => {
      mockPrisma.agentThreadSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.agentThreadSnapshot.create.mockResolvedValue(mockSnapshotRow);

      const result = await service.recordMemoryFlush(
        threadId,
        orgId,
        orgId,
        'Summary of session',
        ['tag-1'],
      );
      expect(agentMemoriesService.createMemory).toHaveBeenCalled();
      expect(result).toBe('mem-id-1');
    });
  });
});
