import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { QualityStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMocks() {
  return {
    ingredientsService: {
      findOne: vi.fn().mockResolvedValue({
        cdnUrl: 'https://cdn.example.com/image.jpg',
      }),
      patch: vi.fn().mockResolvedValue({}),
    },
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    llmDispatcherService: {
      completeStructured: vi.fn().mockResolvedValue({
        feedback: ['Good composition'],
        score: 7,
        suggestions: ['Try better lighting'],
      }),
    },
    postsService: {
      findOne: vi.fn().mockResolvedValue(null),
    },
  };
}

describe('ContentQualityScorerService', () => {
  let service: ContentQualityScorerService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new ContentQualityScorerService(
      mocks.logger as never,
      mocks.llmDispatcherService as never,
      mocks.ingredientsService as never,
      mocks.postsService as never,
    );
  });

  describe('scoreAndTag', () => {
    it('should update ingredient with quality score via patch', async () => {
      const result = await service.scoreAndTag('ingredient-123', 'image');

      expect(mocks.ingredientsService.patch).toHaveBeenCalledWith(
        'ingredient-123',
        expect.objectContaining({
          qualityFeedback: expect.any(Array),
          qualityScore: expect.any(Number),
          qualityStatus: expect.any(String),
        }),
      );
      expect(result.score).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.feedback).toBeDefined();
    });

    it('should set qualityStatus to GOOD when score >= 6', async () => {
      mocks.llmDispatcherService.completeStructured.mockResolvedValue({
        feedback: ['Looks good'],
        score: 7,
        suggestions: [],
      });

      const result = await service.scoreAndTag('ingredient-456', 'image');

      expect(result.status).toBe(QualityStatus.GOOD);
      expect(mocks.ingredientsService.patch).toHaveBeenCalledWith(
        'ingredient-456',
        expect.objectContaining({ qualityStatus: QualityStatus.GOOD }),
      );
    });

    it('should set qualityStatus to NEEDS_REVIEW when score < 6', async () => {
      mocks.llmDispatcherService.completeStructured.mockResolvedValue({
        feedback: ['Low contrast', 'Blurry edges'],
        score: 4,
        suggestions: ['Increase resolution'],
      });

      const result = await service.scoreAndTag('ingredient-789', 'image');

      expect(result.status).toBe(QualityStatus.NEEDS_REVIEW);
      expect(result.score).toBe(4);
      expect(mocks.ingredientsService.patch).toHaveBeenCalledWith(
        'ingredient-789',
        expect.objectContaining({
          qualityScore: 4,
          qualityStatus: QualityStatus.NEEDS_REVIEW,
        }),
      );
    });

    it('should not throw when ingredientsService is not available', async () => {
      const serviceWithoutIngredients = new ContentQualityScorerService(
        mocks.logger as never,
        mocks.llmDispatcherService as never,
        undefined as never,
        undefined as never,
      );

      const result = await serviceWithoutIngredients.scoreAndTag(
        'ingredient-000',
        'image',
      );

      expect(result.score).toBeDefined();
      expect(mocks.ingredientsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('resolveStatus', () => {
    it('should return "good" for scores >= 6', () => {
      expect(ContentQualityScorerService.resolveStatus(6)).toBe(
        QualityStatus.GOOD,
      );
      expect(ContentQualityScorerService.resolveStatus(8)).toBe(
        QualityStatus.GOOD,
      );
      expect(ContentQualityScorerService.resolveStatus(10)).toBe(
        QualityStatus.GOOD,
      );
    });

    it('should return "needs_review" for scores < 6', () => {
      expect(ContentQualityScorerService.resolveStatus(5)).toBe(
        QualityStatus.NEEDS_REVIEW,
      );
      expect(ContentQualityScorerService.resolveStatus(3)).toBe(
        QualityStatus.NEEDS_REVIEW,
      );
      expect(ContentQualityScorerService.resolveStatus(0)).toBe(
        QualityStatus.NEEDS_REVIEW,
      );
    });
  });

  describe('fire-and-forget pattern', () => {
    it('should not block when called without await in catch pattern', async () => {
      const errors: unknown[] = [];
      mocks.llmDispatcherService.completeStructured.mockRejectedValue(
        new Error('Network timeout'),
      );

      // Simulate the fire-and-forget pattern from agent-tool-executor
      const promise = service
        .scoreAndTag('ingredient-err', 'image')
        .catch((err: unknown) => errors.push(err));

      await promise;

      // Service handles errors internally with fallback score — no propagation
      expect(errors).toHaveLength(0);
    });
  });

  describe('quality badge display logic (GenerationActionCard)', () => {
    it('should show quality badge when score is present (score >= 8 = green)', () => {
      const score = 9;
      const status: QualityStatus =
        ContentQualityScorerService.resolveStatus(score);
      expect(status).toBe(QualityStatus.GOOD);
      expect(score).toBeGreaterThanOrEqual(8);
    });

    it('should show regenerate button when score < 6', () => {
      const score = 4;
      const status: QualityStatus =
        ContentQualityScorerService.resolveStatus(score);
      expect(status).toBe(QualityStatus.NEEDS_REVIEW);
      expect(score).toBeLessThan(6);
    });
  });

  describe('structured output', () => {
    it('asks the dispatcher for the scoring schema, not for JSON prose', async () => {
      await service.scoreAndTag('ingredient-123', 'image');

      expect(
        mocks.llmDispatcherService.completeStructured,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ schemaName: 'content_quality_scoring' }),
        undefined,
      );
      const [params] = mocks.llmDispatcherService.completeStructured.mock
        .calls[0] as [{ messages: Array<{ content: string }> }];
      expect(params.messages[0].content).not.toContain('valid JSON');
    });

    it('scores neutral when the model misses the schema twice', async () => {
      mocks.llmDispatcherService.completeStructured.mockRejectedValue(
        new LlmStructuredOutputError('content_quality_scoring', [
          { code: 'invalid_type', message: 'expected number', path: 'score' },
        ]),
      );

      const result = await service.scoreAndTag('ingredient-bad', 'image');

      expect(result.score).toBe(5);
      expect(result.status).toBe(QualityStatus.NEEDS_REVIEW);
      expect(mocks.logger.error).toHaveBeenCalled();
    });
    it('forwards the organization so BYOK keys resolve', async () => {
      await service.scoreAndTag('ingredient-123', 'image', {
        organizationId: 'org-1',
      });

      expect(
        mocks.llmDispatcherService.completeStructured,
      ).toHaveBeenCalledWith(expect.anything(), 'org-1');
    });
  });
});
