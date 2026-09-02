import { INSIGHT_GENERATION_ACTION_IDS } from '@api/collections/insights/services/insight-generation-workflow-definition';
import { InsightsService } from '@api/collections/insights/services/insights.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Timeframe } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

type MockInsightDelegate = {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

type WorkflowActionHandler = (context: {
  input: Record<string, unknown>;
}) => Promise<unknown> | unknown;

describe('InsightsService', () => {
  let service: InsightsService;
  let delegate: MockInsightDelegate;
  let forecastDelegate: { findMany: ReturnType<typeof vi.fn> };
  let llmDispatcherService: {
    chatCompletion: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let workflowActions: Map<string, WorkflowActionHandler>;

  const existing = {
    data: { forecast: { value: 42 }, isRead: false },
    id: 'insight-1',
    isDeleted: false,
    organizationId: 'org-1',
  };

  beforeEach(() => {
    delegate = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) => ({
        createdAt: new Date('2026-07-15T00:00:00.000Z'),
        id: 'generated-insight',
        isDeleted: false,
        isDismissed: false,
        isRead: false,
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockImplementation(({ data }) => ({
        ...existing,
        isDismissed: false,
        isRead: false,
        ...data,
      })),
    };
    llmDispatcherService = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                insights: [
                  {
                    actionableSteps: ['Publish the follow-up'],
                    confidence: 82,
                    description: 'The current series is gaining momentum.',
                    impact: 'high',
                    relatedMetrics: ['reach'],
                    title: 'Continue the series',
                    type: 'opportunity',
                  },
                ],
              }),
            },
          },
        ],
      }),
    };
    forecastDelegate = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    workflowActions = new Map();

    service = new InsightsService(
      {
        forecast: forecastDelegate,
        insight: delegate,
      } as unknown as PrismaService,
      logger as unknown as LoggerService,
      {} as unknown as ModelsService,
      llmDispatcherService as unknown as LlmDispatcherService,
      { queueSystemWorkflow: vi.fn() } as never,
      {
        registerAction: vi.fn(
          (actionId: string, handler: WorkflowActionHandler) => {
            workflowActions.set(actionId, handler);
          },
        ),
        registerWorkflow: vi.fn(),
      } as never,
    );
    service.onModuleInit();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInsights', () => {
    it('reads a capped active window from typed columns and does not generate', async () => {
      const storedInsight = {
        ...existing,
        category: 'opportunity',
        expiresAt: new Date('2026-08-20T00:00:00.000Z'),
        isDismissed: false,
        isRead: false,
        data: {
          confidence: 75,
          description: 'Stored insight',
          impact: 'medium',
          title: 'Stored insight',
        },
      };
      delegate.findMany.mockResolvedValue([storedInsight]);

      const result = await service.getInsights('org-1', 2);

      expect(delegate.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 2,
        where: expect.objectContaining({
          isDeleted: false,
          isDismissed: false,
          isRead: false,
          organizationId: 'org-1',
        }),
      });
      expect(llmDispatcherService.chatCompletion).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        category: 'opportunity',
        isRead: false,
        title: 'Stored insight',
      });
    });

    it('returns an empty recoverable read when nothing is stored', async () => {
      await expect(service.getInsights('org-1', 5)).resolves.toEqual([]);
      expect(llmDispatcherService.chatCompletion).not.toHaveBeenCalled();
    });
  });

  describe('needsInsightGeneration', () => {
    it('counts active rows instead of loading the full history', async () => {
      delegate.count.mockResolvedValue(1);

      await expect(service.needsInsightGeneration('org-1', 5)).resolves.toBe(
        true,
      );
      expect(delegate.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          isDeleted: false,
          isDismissed: false,
          isRead: false,
          organizationId: 'org-1',
        }),
      });
      expect(delegate.findMany).not.toHaveBeenCalled();
    });
  });

  describe('insight generation workflow actions', () => {
    it('loads only stable JSON identifiers into workflow state', async () => {
      delegate.findMany.mockResolvedValue([
        { id: 'insight-1' },
        { id: 'insight-2' },
      ]);
      const load = workflowActions.get(INSIGHT_GENERATION_ACTION_IDS.LOAD);

      await expect(
        load?.({ input: { request: { limit: 5, organizationId: 'org-1' } } }),
      ).resolves.toEqual({
        existingIds: ['insight-1', 'insight-2'],
        missingCount: 3,
        organizationId: 'org-1',
      });
      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true }, take: 5 }),
      );
    });

    it('persists drafts and returns identifiers instead of Prisma rows', async () => {
      const persist = workflowActions.get(
        INSIGHT_GENERATION_ACTION_IDS.PERSIST,
      );

      await expect(
        persist?.({
          input: {
            generated: {
              drafts: [{ category: 'opportunity', title: 'Keep shipping' }],
            },
            plan: {
              existingIds: ['insight-1'],
              missingCount: 1,
              organizationId: 'org-1',
            },
          },
        }),
      ).resolves.toEqual({
        insightIds: ['insight-1', 'generated-insight'],
        persisted: 1,
      });
      expect(delegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isDismissed: false,
          isRead: false,
          organizationId: 'org-1',
        }),
      });
    });
  });

  describe('update', () => {
    it('merges isRead into the data blob while preserving other keys', async () => {
      await service.update('insight-1', 'org-1', { isRead: true });

      expect(delegate.update).toHaveBeenCalledWith({
        data: {
          data: { forecast: { value: 42 }, isRead: true },
          isRead: true,
        },
        where: {
          id: 'insight-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('merges isDismissed into the data blob', async () => {
      await service.update('insight-1', 'org-1', { isDismissed: true });

      expect(delegate.update).toHaveBeenCalledWith({
        data: {
          data: { forecast: { value: 42 }, isDismissed: true, isRead: false },
          isDismissed: true,
        },
        where: {
          id: 'insight-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('applies both flags at once', async () => {
      await service.update('insight-1', 'org-1', {
        isDismissed: true,
        isRead: true,
      });

      expect(delegate.update).toHaveBeenCalledWith({
        data: {
          data: { forecast: { value: 42 }, isDismissed: true, isRead: true },
          isDismissed: true,
          isRead: true,
        },
        where: {
          id: 'insight-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('throws when the insight is not found', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await expect(
        service.update('missing', 'org-1', { isRead: true }),
      ).rejects.toThrow('Insight not found');
    });
  });

  describe('getForecast', () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const makeForecastRow = (
      id: string,
      data: Record<string, unknown>,
    ): Record<string, unknown> => ({
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
      data,
      id,
      isDeleted: false,
      organizationId: 'org-1',
    });

    it('reads the forecast table once for all requested metrics', async () => {
      forecastDelegate.findMany.mockResolvedValue([
        makeForecastRow('forecast-engagement', {
          data: { value: 1 },
          metric: 'engagement',
          period: Timeframe.D30,
          validUntil: futureDate,
        }),
        makeForecastRow('forecast-followers', {
          data: { value: 2 },
          metric: 'followers',
          period: Timeframe.D30,
          validUntil: futureDate,
        }),
      ]);

      const result = await service.getForecast(
        { metrics: ['engagement', 'followers'], period: Timeframe.D30 },
        'org-1',
      );

      expect(forecastDelegate.findMany).toHaveBeenCalledTimes(1);
      expect(forecastDelegate.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            {
              OR: [
                { data: { equals: 'engagement', path: ['metric'] } },
                { data: { equals: 'followers', path: ['metric'] } },
              ],
            },
            { data: { equals: Timeframe.D30, path: ['period'] } },
            {
              data: {
                gt: expect.any(String),
                path: ['validUntil'],
              },
            },
          ],
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(result).toHaveLength(2);
      expect(result.map((forecast) => forecast.id)).toEqual([
        'forecast-engagement',
        'forecast-followers',
      ]);
    });

    it('keeps the first stored row when a metric has duplicates', async () => {
      forecastDelegate.findMany.mockResolvedValue([
        makeForecastRow('forecast-first', {
          metric: 'engagement',
          period: Timeframe.D30,
          validUntil: futureDate,
        }),
        makeForecastRow('forecast-second', {
          metric: 'engagement',
          period: Timeframe.D30,
          validUntil: futureDate,
        }),
      ]);

      const result = await service.getForecast(
        { metrics: ['engagement'], period: Timeframe.D30 },
        'org-1',
      );

      expect(result.map((forecast) => forecast.id)).toEqual(['forecast-first']);
    });

    it('falls through when the database finds no valid row', async () => {
      forecastDelegate.findMany.mockResolvedValue([]);

      await expect(
        service.getForecast(
          { metrics: ['engagement'], period: Timeframe.D30 },
          'org-1',
        ),
      ).rejects.toThrow('Insufficient data');
      expect(forecastDelegate.findMany).toHaveBeenCalledTimes(1);
    });

    it('falls through to generation when no stored forecast matches', async () => {
      forecastDelegate.findMany.mockResolvedValue([]);

      await expect(
        service.getForecast(
          { metrics: ['engagement'], period: Timeframe.D30 },
          'org-1',
        ),
      ).rejects.toThrow(
        'Insufficient data: real value for metric "engagement"',
      );
    });
  });
});
