import { InsightsService } from '@api/collections/insights/services/insights.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

type MockInsightDelegate = {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

describe('InsightsService', () => {
  let service: InsightsService;
  let delegate: MockInsightDelegate;
  let llmDispatcherService: {
    chatCompletion: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const existing = {
    data: { forecast: { value: 42 }, isRead: false },
    id: 'insight-1',
    isDeleted: false,
    organizationId: 'org-1',
  };

  beforeEach(() => {
    delegate = {
      create: vi.fn().mockImplementation(({ data }) => ({
        createdAt: new Date('2026-07-15T00:00:00.000Z'),
        id: 'generated-insight',
        isDeleted: false,
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(existing),
      update: vi
        .fn()
        .mockImplementation(({ data }) => ({ ...existing, ...data })),
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
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new InsightsService(
      { insight: delegate } as unknown as PrismaService,
      logger as unknown as LoggerService,
      {} as unknown as ModelsService,
      llmDispatcherService as unknown as LlmDispatcherService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInsights', () => {
    it('uses the authenticated LLM dispatcher and persists generated insights in organization scope', async () => {
      const result = await service.getInsights('org-1', 1);

      expect(llmDispatcherService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [expect.objectContaining({ role: 'user' })],
          model: 'anthropic/claude-sonnet-4-5',
        }),
        'org-1',
      );
      expect(delegate.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        where: { isDeleted: false, organizationId: 'org-1' },
      });
      expect(delegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'org-1' }),
      });
      expect(result).toHaveLength(1);
    });

    it('returns an empty recoverable read when no insights are generated', async () => {
      llmDispatcherService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: '{"insights":[]}' } }],
      });

      await expect(service.getInsights('org-1', 5)).resolves.toEqual([]);
    });

    it('returns existing insights when the provider is unavailable', async () => {
      const storedInsight = {
        ...existing,
        data: {
          confidence: 75,
          description: 'Stored insight',
          impact: 'medium',
          isDismissed: false,
          isRead: false,
          title: 'Stored insight',
        },
      };
      delegate.findMany.mockResolvedValue([storedInsight]);
      llmDispatcherService.chatCompletion.mockRejectedValue(
        new Error('upstream body includes api_key=secret-value'),
      );

      await expect(service.getInsights('org-1', 2)).resolves.toEqual([
        storedInsight,
      ]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Insight generation provider unavailable',
        {
          organizationId: 'org-1',
          providerStatus: 'unavailable',
        },
      );
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
        'secret-value',
      );
    });

    it('does not call a provider when enough active insights already exist', async () => {
      delegate.findMany.mockResolvedValue([
        { ...existing, id: 'insight-1' },
        { ...existing, id: 'insight-2' },
      ]);

      const result = await service.getInsights('org-1', 2);

      expect(result).toHaveLength(2);
      expect(llmDispatcherService.chatCompletion).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('merges isRead into the data blob while preserving other keys', async () => {
      await service.update('insight-1', 'org-1', { isRead: true });

      expect(delegate.update).toHaveBeenCalledWith({
        data: { data: { forecast: { value: 42 }, isRead: true } },
        where: { id: 'insight-1' },
      });
    });

    it('merges isDismissed into the data blob', async () => {
      await service.update('insight-1', 'org-1', { isDismissed: true });

      expect(delegate.update).toHaveBeenCalledWith({
        data: {
          data: { forecast: { value: 42 }, isDismissed: true, isRead: false },
        },
        where: { id: 'insight-1' },
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
        },
        where: { id: 'insight-1' },
      });
    });

    it('throws when the insight is not found', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await expect(
        service.update('missing', 'org-1', { isRead: true }),
      ).rejects.toThrow('Insight not found');
    });
  });
});
