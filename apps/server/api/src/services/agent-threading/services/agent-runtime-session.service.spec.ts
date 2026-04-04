import { DB_CONNECTIONS } from '@api/constants/database.constants';
import type { AgentSessionBindingDocument } from '@api/services/agent-threading/schemas/agent-session-binding.schema';
import { AgentSessionBinding } from '@api/services/agent-threading/schemas/agent-session-binding.schema';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Effect } from 'effect';
import { Types } from 'mongoose';

describe('AgentRuntimeSessionService', () => {
  let service: AgentRuntimeSessionService;
  let sessionBindingModel: {
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let logger: vi.Mocked<LoggerService>;

  const threadId = new Types.ObjectId().toString();
  const organizationId = new Types.ObjectId().toString();
  const runId = new Types.ObjectId().toString();

  const mockBinding = {
    _id: new Types.ObjectId(),
    organization: new Types.ObjectId(organizationId),
    status: 'active',
    thread: new Types.ObjectId(threadId),
  } as unknown as AgentSessionBindingDocument;

  beforeEach(async () => {
    sessionBindingModel = {
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRuntimeSessionService,
        {
          provide: getModelToken(
            AgentSessionBinding.name,
            DB_CONNECTIONS.AGENT,
          ),
          useValue: sessionBindingModel,
        },
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
    }).compile();

    service = module.get<AgentRuntimeSessionService>(
      AgentRuntimeSessionService,
    );
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertBinding', () => {
    it('should expose an Effect-based upsert path', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue(mockBinding);

      const result = await Effect.runPromise(
        service.upsertBindingEffect({
          organizationId,
          status: 'active',
          threadId,
        }),
      );

      expect(result).toEqual(mockBinding);
      expect(sessionBindingModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('should upsert a binding with required fields', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue(mockBinding);

      const result = await service.upsertBinding({
        organizationId,
        status: 'active',
        threadId,
      });

      expect(result).toEqual(mockBinding);
      expect(sessionBindingModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
          thread: expect.any(Types.ObjectId),
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'active' }),
          $setOnInsert: expect.objectContaining({
            organization: expect.any(Types.ObjectId),
            thread: expect.any(Types.ObjectId),
          }),
        }),
        { new: true, upsert: true },
      );
    });

    it('should include optional model when provided', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue(mockBinding);

      await service.upsertBinding({
        model: 'gpt-4o',
        organizationId,
        status: 'active',
        threadId,
      });

      expect(sessionBindingModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({ model: 'gpt-4o' }),
        }),
        expect.any(Object),
      );
    });

    it('should include resumeCursor when provided', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue(mockBinding);
      const resumeCursor = { index: 3, step: 'generate' };

      await service.upsertBinding({
        organizationId,
        resumeCursor,
        status: 'active',
        threadId,
      });

      expect(sessionBindingModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({ resumeCursor }),
        }),
        expect.any(Object),
      );
    });

    it('should include activeCommandId when provided', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue(mockBinding);
      const activeCommandId = 'cmd-abc-123';

      await service.upsertBinding({
        activeCommandId,
        organizationId,
        status: 'active',
        threadId,
      });

      expect(sessionBindingModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({ activeCommandId }),
        }),
        expect.any(Object),
      );
    });

    it('should omit optional fields when not provided', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue(mockBinding);

      await service.upsertBinding({
        organizationId,
        status: 'idle',
        threadId,
      });

      const callArgs = sessionBindingModel.findOneAndUpdate.mock.calls[0];
      const setClause = callArgs[1].$set;

      expect(setClause).not.toHaveProperty('model');
      expect(setClause).not.toHaveProperty('resumeCursor');
      expect(setClause).not.toHaveProperty('activeCommandId');
      expect(setClause).not.toHaveProperty('runId');
    });

    it('should return null when model returns null', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue(null);

      const result = await service.upsertBinding({
        organizationId,
        status: 'active',
        threadId,
      });

      expect(result).toBeNull();
    });

    it('should propagate errors from the model', async () => {
      sessionBindingModel.findOneAndUpdate.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.upsertBinding({ organizationId, status: 'active', threadId }),
      ).rejects.toThrow('DB error');
    });
  });

  describe('getBinding', () => {
    it('should expose an Effect-based get path', async () => {
      sessionBindingModel.findOne.mockResolvedValue(mockBinding);

      const result = await Effect.runPromise(
        service.getBindingEffect(threadId, organizationId),
      );

      expect(result).toEqual(mockBinding);
      expect(sessionBindingModel.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        organization: expect.any(Types.ObjectId),
        thread: expect.any(Types.ObjectId),
      });
    });

    it('should return an existing binding', async () => {
      sessionBindingModel.findOne.mockResolvedValue(mockBinding);

      const result = await service.getBinding(threadId, organizationId);

      expect(result).toEqual(mockBinding);
      expect(sessionBindingModel.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        organization: expect.any(Types.ObjectId),
        thread: expect.any(Types.ObjectId),
      });
    });

    it('should return null when binding does not exist', async () => {
      sessionBindingModel.findOne.mockResolvedValue(null);

      const result = await service.getBinding(threadId, organizationId);

      expect(result).toBeNull();
    });
  });

  describe('markCancelled', () => {
    it('should upsert with cancelled status', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue({
        ...mockBinding,
        status: 'cancelled',
      });

      await service.markCancelled(threadId, organizationId, runId);

      expect(sessionBindingModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'cancelled' }),
        }),
        expect.any(Object),
      );
    });

    it('should log a warning after cancellation', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue({
        ...mockBinding,
        status: 'cancelled',
      });

      await service.markCancelled(threadId, organizationId, runId);

      expect(logger.warn).toHaveBeenCalledWith(
        'Agent runtime session marked cancelled',
        expect.objectContaining({ organizationId, runId, threadId }),
      );
    });

    it('should work without a runId', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue(mockBinding);

      await service.markCancelled(threadId, organizationId);

      expect(sessionBindingModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('markCancelled', () => {
    it('should expose an Effect-based cancel path and log the transition', async () => {
      sessionBindingModel.findOneAndUpdate.mockResolvedValue(mockBinding);

      await Effect.runPromise(
        service.markCancelledEffect(threadId, organizationId, runId),
      );

      expect(sessionBindingModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            runId,
            status: 'cancelled',
          }),
        }),
        expect.any(Object),
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
