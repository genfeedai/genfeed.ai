import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AgentInputRequest } from '@api/services/agent-threading/schemas/agent-input-request.schema';
import { AgentProfileSnapshot } from '@api/services/agent-threading/schemas/agent-profile-snapshot.schema';
import { AgentSessionBinding } from '@api/services/agent-threading/schemas/agent-session-binding.schema';
import { AgentThreadEvent } from '@api/services/agent-threading/schemas/agent-thread-event.schema';
import { AgentThreadSnapshot } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Effect } from 'effect';
import { Types } from 'mongoose';

import { AgentThreadEngineService } from './agent-thread-engine.service';

const makeObjectId = () => new Types.ObjectId();
const orgId = makeObjectId().toString();
const threadId = makeObjectId().toString();
const commandId = 'cmd-abc';

const mockThread = {
  _id: makeObjectId(),
  source: 'discord',
  status: 'active',
  title: 'Test thread',
};
const mockEvent = {
  _id: makeObjectId(),
  commandId,
  metadata: {},
  organization: new Types.ObjectId(orgId),
  payload: {},
  runId: 'run-1',
  sequence: 1,
  thread: new Types.ObjectId(threadId),
  type: 'work.started',
};
const mockSnapshot = {
  _id: makeObjectId(),
  lastSequence: 1,
  organization: new Types.ObjectId(orgId),
  thread: new Types.ObjectId(threadId),
};

describe('AgentThreadEngineService', () => {
  let service: AgentThreadEngineService;
  let eventModel: Record<string, ReturnType<typeof vi.fn>>;
  let snapshotModel: Record<string, ReturnType<typeof vi.fn>>;
  let sessionBindingModel: Record<string, ReturnType<typeof vi.fn>>;
  let inputRequestModel: Record<string, ReturnType<typeof vi.fn>>;
  let profileSnapshotModel: Record<string, ReturnType<typeof vi.fn>>;
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
    eventModel = {
      create: vi.fn().mockResolvedValue(mockEvent),
      find: vi
        .fn()
        .mockReturnValue({ sort: vi.fn().mockResolvedValue([mockEvent]) }),
      findOne: vi.fn().mockResolvedValue(null),
    };
    snapshotModel = {
      create: vi.fn().mockResolvedValue(mockSnapshot),
      findOne: vi.fn().mockResolvedValue(null),
      findOneAndUpdate: vi.fn().mockResolvedValue(mockSnapshot),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    sessionBindingModel = { findOne: vi.fn().mockResolvedValue(null) };
    inputRequestModel = {
      findOneAndUpdate: vi.fn().mockResolvedValue({
        _id: makeObjectId(),
        answer: '42',
        requestId: 'req-1',
        status: 'resolved',
      }),
    };
    profileSnapshotModel = {
      findOne: vi.fn().mockResolvedValue(null),
      findOneAndUpdate: vi.fn().mockResolvedValue({ agentType: 'default' }),
    };
    agentThreadsService = { findOne: vi.fn().mockResolvedValue(mockThread) };
    agentMemoriesService = {
      createMemory: vi.fn().mockResolvedValue({ _id: makeObjectId() }),
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
        {
          provide: getModelToken(AgentThreadEvent.name, DB_CONNECTIONS.AGENT),
          useValue: eventModel,
        },
        {
          provide: getModelToken(
            AgentThreadSnapshot.name,
            DB_CONNECTIONS.AGENT,
          ),
          useValue: snapshotModel,
        },
        {
          provide: getModelToken(
            AgentSessionBinding.name,
            DB_CONNECTIONS.AGENT,
          ),
          useValue: sessionBindingModel,
        },
        {
          provide: getModelToken(AgentInputRequest.name, DB_CONNECTIONS.AGENT),
          useValue: inputRequestModel,
        },
        {
          provide: getModelToken(
            AgentProfileSnapshot.name,
            DB_CONNECTIONS.AGENT,
          ),
          useValue: profileSnapshotModel,
        },
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

  // ── appendEvent ────────────────────────────────────────────────────────────
  describe('appendEvent', () => {
    const params = {
      commandId,
      organizationId: orgId,
      threadId,
      type: 'work.started' as const,
    };

    it('creates a new event when none exists', async () => {
      const result = await service.appendEvent(params);
      expect(eventModel.create).toHaveBeenCalled();
      expect(result).toEqual(mockEvent);
    });

    it('exposes an Effect-based append path', async () => {
      const result = await Effect.runPromise(service.appendEventEffect(params));

      expect(result).toEqual(mockEvent);
      expect(eventModel.create).toHaveBeenCalled();
    });

    it('returns existing event when duplicate commandId+type found', async () => {
      eventModel.findOne.mockResolvedValue(mockEvent);
      const result = await service.appendEvent(params);
      expect(eventModel.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockEvent);
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
      snapshotModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.appendEvent(params)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calls runtimeSessionService.upsertBinding for work.started event', async () => {
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

  // ── listEvents ─────────────────────────────────────────────────────────────
  describe('listEvents', () => {
    it('exposes an Effect-based list path', async () => {
      const result = await Effect.runPromise(
        service.listEventsEffect(threadId, orgId),
      );

      expect(result).toEqual([mockEvent]);
      expect(eventModel.find).toHaveBeenCalled();
    });

    it('returns sorted events', async () => {
      const result = await service.listEvents(threadId, orgId);
      expect(eventModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockEvent]);
    });

    it('applies afterSequence filter when provided', async () => {
      await service.listEvents(threadId, orgId, 5);
      expect(eventModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ sequence: { $gt: 5 } }),
      );
    });

    it('throws BadRequestException for invalid threadId', async () => {
      await expect(service.listEvents('bad', orgId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── getSnapshot ────────────────────────────────────────────────────────────
  describe('getSnapshot', () => {
    it('exposes an Effect-based snapshot path', async () => {
      snapshotModel.findOne.mockResolvedValue(mockSnapshot);

      const result = await Effect.runPromise(
        service.getSnapshotEffect(threadId, orgId),
      );

      expect(result).toEqual(mockSnapshot);
    });

    it('creates snapshot when none exists', async () => {
      snapshotModel.findOne.mockResolvedValue(null);
      snapshotModel.create.mockResolvedValue(mockSnapshot);
      const result = await service.getSnapshot(threadId, orgId);
      expect(snapshotModel.create).toHaveBeenCalled();
      expect(result).toEqual(mockSnapshot);
    });

    it('returns existing snapshot', async () => {
      snapshotModel.findOne.mockResolvedValue(mockSnapshot);
      const result = await service.getSnapshot(threadId, orgId);
      expect(snapshotModel.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockSnapshot);
    });
  });

  // ── resolveInputRequest ───────────────────────────────────────────────────
  describe('resolveInputRequest', () => {
    it('exposes an Effect-based input resolution path', async () => {
      const result = await Effect.runPromise(
        service.resolveInputRequestEffect({
          answer: '42',
          organizationId: orgId,
          requestId: 'req-1',
          threadId,
          userId: makeObjectId().toString(),
        }),
      );

      expect(result.status).toBe('resolved');
      expect(inputRequestModel.findOneAndUpdate).toHaveBeenCalled();
    });

    it('resolves a pending input request', async () => {
      const result = await service.resolveInputRequest({
        answer: '42',
        organizationId: orgId,
        requestId: 'req-1',
        threadId,
        userId: makeObjectId().toString(),
      });
      expect(inputRequestModel.findOneAndUpdate).toHaveBeenCalled();
      expect(result.status).toBe('resolved');
    });

    it('throws NotFoundException when request not found', async () => {
      inputRequestModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(
        service.resolveInputRequest({
          answer: 'x',
          organizationId: orgId,
          requestId: 'missing',
          threadId,
          userId: makeObjectId().toString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── recordMemoryFlush ─────────────────────────────────────────────────────
  describe('recordProfileSnapshot', () => {
    it('exposes an Effect-based profile snapshot path', async () => {
      const result = await Effect.runPromise(
        service.recordProfileSnapshotEffect(threadId, orgId, {
          agentType: 'default',
        }),
      );

      expect(result).toEqual({ agentType: 'default' });
      expect(profileSnapshotModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('recordMemoryFlush', () => {
    it('exposes an Effect-based memory flush path', async () => {
      const memId = makeObjectId();
      agentMemoriesService.createMemory.mockResolvedValue({
        _id: memId,
      } as never);

      const result = await Effect.runPromise(
        service.recordMemoryFlushEffect(
          threadId,
          orgId,
          makeObjectId().toString(),
          'Summary of session',
          ['tag-1'],
        ),
      );

      expect(result).toBe(String(memId));
      expect(agentMemoriesService.createMemory).toHaveBeenCalled();
    });

    it('creates memory and appends event', async () => {
      const memId = makeObjectId();
      agentMemoriesService.createMemory.mockResolvedValue({
        _id: memId,
      } as never);
      const result = await service.recordMemoryFlush(
        threadId,
        orgId,
        makeObjectId().toString(),
        'Summary of session',
        ['tag-1'],
      );
      expect(agentMemoriesService.createMemory).toHaveBeenCalled();
      expect(result).toBe(String(memId));
    });
  });
});
