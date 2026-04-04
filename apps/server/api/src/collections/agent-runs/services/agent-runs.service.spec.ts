import { AgentRun } from '@api/collections/agent-runs/schemas/agent-run.schema';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { Ingredient } from '@api/collections/ingredients/schemas/ingredient.schema';
import { Post } from '@api/collections/posts/schemas/post.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AgentExecutionStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('AgentRunsService', () => {
  let service: AgentRunsService;

  const orgId = new Types.ObjectId().toString();
  const runId = new Types.ObjectId().toString();

  const makeRun = (overrides = {}) => ({
    _id: new Types.ObjectId(runId),
    isDeleted: false,
    organization: new Types.ObjectId(orgId),
    startedAt: new Date(Date.now() - 5000),
    status: AgentExecutionStatus.RUNNING,
    ...overrides,
  });

  let model: {
    aggregate: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
  let postModel: { find: ReturnType<typeof vi.fn> };
  let ingredientModel: { find: ReturnType<typeof vi.fn> };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  const chainableFindMock = (docs: unknown[]) => ({
    exec: vi.fn().mockResolvedValue(docs),
    lean: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
  });

  const chainablePostMock = (docs: unknown[]) => ({
    exec: vi.fn().mockResolvedValue(docs),
    lean: vi.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    model = {
      aggregate: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockReturnValue(chainableFindMock([])),
      findOne: vi.fn().mockResolvedValue(makeRun()),
      findOneAndUpdate: vi.fn().mockResolvedValue(makeRun()),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    postModel = {
      find: vi.fn().mockReturnValue(chainablePostMock([])),
    };
    ingredientModel = {
      find: vi.fn().mockReturnValue(chainablePostMock([])),
    };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRunsService,
        {
          provide: getModelToken(AgentRun.name, DB_CONNECTIONS.AGENT),
          useValue: model,
        },
        {
          provide: getModelToken(Post.name, DB_CONNECTIONS.CLOUD),
          useValue: postModel,
        },
        {
          provide: getModelToken(Ingredient.name, DB_CONNECTIONS.CLOUD),
          useValue: ingredientModel,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<AgentRunsService>(AgentRunsService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('start', () => {
    it('should update status to RUNNING', async () => {
      const expected = makeRun({ status: AgentExecutionStatus.RUNNING });
      model.findOneAndUpdate.mockResolvedValue(expected);

      const result = await service.start(runId, orgId);

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: expect.any(Types.ObjectId) }),
        expect.objectContaining({ status: AgentExecutionStatus.RUNNING }),
        expect.any(Object),
      );
      expect(result?.status).toBe(AgentExecutionStatus.RUNNING);
    });

    it('should return null when run not found', async () => {
      model.findOneAndUpdate.mockResolvedValue(null);
      const result = await service.start(runId, orgId);
      expect(result).toBeNull();
    });
  });

  describe('getById', () => {
    it('should return run by id and orgId', async () => {
      const run = makeRun();
      model.findOne.mockResolvedValue(run);

      const result = await service.getById(runId, orgId);

      expect(result).toEqual(run);
    });

    it('should return null when not found', async () => {
      model.findOne.mockResolvedValue(null);
      const result = await service.getById(runId, orgId);
      expect(result).toBeNull();
    });
  });

  describe('isCancelled', () => {
    it('should return true when run status is CANCELLED', async () => {
      model.findOne.mockResolvedValue(
        makeRun({ status: AgentExecutionStatus.CANCELLED }),
      );
      const result = await service.isCancelled(runId, orgId);
      expect(result).toBe(true);
    });

    it('should return false when run status is RUNNING', async () => {
      model.findOne.mockResolvedValue(
        makeRun({ status: AgentExecutionStatus.RUNNING }),
      );
      const result = await service.isCancelled(runId, orgId);
      expect(result).toBe(false);
    });

    it('should return false when run is not found', async () => {
      model.findOne.mockResolvedValue(null);
      const result = await service.isCancelled(runId, orgId);
      expect(result).toBe(false);
    });
  });

  describe('updateProgress', () => {
    it('should clamp progress to 0-100 range', async () => {
      await service.updateProgress(runId, orgId, 150);
      expect(model.updateOne).toHaveBeenCalledWith(expect.any(Object), {
        $set: { progress: 100 },
      });

      await service.updateProgress(runId, orgId, -10);
      expect(model.updateOne).toHaveBeenCalledWith(expect.any(Object), {
        $set: { progress: 0 },
      });
    });

    it('should set progress 50 unmodified', async () => {
      await service.updateProgress(runId, orgId, 50);
      expect(model.updateOne).toHaveBeenCalledWith(expect.any(Object), {
        $set: { progress: 50 },
      });
    });
  });

  describe('mergeMetadata', () => {
    it('should merge metadata under the metadata namespace', async () => {
      await service.mergeMetadata(runId, orgId, {
        actualModel: 'anthropic/claude-sonnet-4-5-20250929',
        requestedModel: 'openrouter/auto',
      });

      expect(model.updateOne).toHaveBeenCalledWith(expect.any(Object), {
        $set: {
          'metadata.actualModel': 'anthropic/claude-sonnet-4-5-20250929',
          'metadata.requestedModel': 'openrouter/auto',
        },
      });
    });
  });

  describe('complete', () => {
    it('should set status to COMPLETED with durationMs', async () => {
      const run = makeRun({ startedAt: new Date(Date.now() - 3000) });
      model.findOne.mockResolvedValue(run);
      model.findOneAndUpdate.mockResolvedValue({
        ...run,
        progress: 100,
        status: AgentExecutionStatus.COMPLETED,
      });

      const result = await service.complete(runId, orgId, 'Done!');

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          progress: 100,
          status: AgentExecutionStatus.COMPLETED,
          summary: 'Done!',
        }),
        expect.any(Object),
      );
      expect(result?.status).toBe(AgentExecutionStatus.COMPLETED);
    });

    it('should return null when run not found', async () => {
      model.findOne.mockResolvedValue(null);
      const result = await service.complete(runId, orgId);
      expect(result).toBeNull();
    });
  });

  describe('fail', () => {
    it('should set status to FAILED with error and increment retryCount', async () => {
      model.findOne.mockResolvedValue(makeRun());
      model.findOneAndUpdate.mockResolvedValue(
        makeRun({ status: AgentExecutionStatus.FAILED }),
      );

      await service.fail(runId, orgId, 'Something went wrong');

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $inc: { retryCount: 1 },
          $set: expect.objectContaining({
            error: 'Something went wrong',
            status: AgentExecutionStatus.FAILED,
          }),
        }),
        expect.any(Object),
      );
    });

    it('should return null when run not found', async () => {
      model.findOne.mockResolvedValue(null);
      const result = await service.fail(runId, orgId, 'error');
      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return default stats when aggregate is empty', async () => {
      model.aggregate.mockResolvedValue([]);

      const stats = await service.getStats(orgId);

      expect(stats).toEqual({
        activeRuns: 0,
        anomalies: [],
        autoRoutedRuns: 0,
        completedToday: 0,
        failedToday: 0,
        routingPaths: [],
        timeRange: '7d',
        topActualModels: [],
        topRequestedModels: [],
        totalCreditsToday: 0,
        totalRuns: 0,
        trends: [],
        webEnabledRuns: 0,
      });
    });

    it('should return aggregate stats when present', async () => {
      model.aggregate.mockResolvedValue([
        {
          routingPaths: [
            {
              actualModel: 'google/gemini-2.5-flash',
              count: 20,
              requestedModel: 'openrouter/auto',
            },
          ],
          summary: [
            {
              _id: null,
              activeRuns: 2,
              autoRoutedRuns: 40,
              completedToday: 5,
              failedToday: 1,
              totalCreditsToday: 300,
              totalRuns: 50,
              webEnabledRuns: 12,
            },
          ],
          topActualModels: [{ count: 25, model: 'google/gemini-2.5-flash' }],
          topRequestedModels: [{ count: 40, model: 'openrouter/auto' }],
          trends: [
            {
              autoRoutedRuns: 10,
              bucket: '2026-03-24',
              totalCreditsUsed: 120,
              totalRuns: 20,
              webEnabledRuns: 8,
            },
            {
              autoRoutedRuns: 20,
              bucket: '2026-03-25',
              totalCreditsUsed: 180,
              totalRuns: 25,
              webEnabledRuns: 5,
            },
          ],
        },
      ]);

      const stats = await service.getStats(orgId, { timeRange: '30d' });

      expect(stats.activeRuns).toBe(2);
      expect(stats.autoRoutedRuns).toBe(40);
      expect(stats.totalRuns).toBe(50);
      expect(stats.timeRange).toBe('30d');
      expect(stats.topActualModels[0]).toEqual({
        count: 25,
        model: 'google/gemini-2.5-flash',
      });
      expect(stats.routingPaths[0]).toEqual({
        actualModel: 'google/gemini-2.5-flash',
        count: 20,
        requestedModel: 'openrouter/auto',
      });
      expect(stats.trends).toHaveLength(2);
    });
  });

  describe('getRunContent', () => {
    it('should return posts and ingredients for a run', async () => {
      const post = { _id: new Types.ObjectId(), label: 'p1' };
      const ingredient = { _id: new Types.ObjectId(), label: 'i1' };

      postModel.find.mockReturnValue(chainablePostMock([post]));
      ingredientModel.find.mockReturnValue(chainablePostMock([ingredient]));

      const result = await service.getRunContent(runId, orgId);

      expect(result.posts).toHaveLength(1);
      expect(result.ingredients).toHaveLength(1);
    });

    it('should return empty arrays when no content found', async () => {
      const result = await service.getRunContent(runId, orgId);

      expect(result.posts).toHaveLength(0);
      expect(result.ingredients).toHaveLength(0);
    });
  });
});
