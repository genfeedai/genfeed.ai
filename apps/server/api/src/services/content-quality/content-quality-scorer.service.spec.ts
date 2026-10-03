import { createHash } from 'node:crypto';
import {
  formatScorerHarnessCriteria,
  IMAGE_SCORING_PROMPT,
  TEXT_SCORING_PROMPT,
  VIDEO_SCORING_PROMPT,
  VISION_RUBRIC_PROMPT,
} from '@api/services/content-quality/content-quality-scorer.prompts';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { QualityStatus } from '@genfeedai/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
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

describe('content-quality scorer prompts', () => {
  // Digests of the prompt text as it stood in the service before the #5991
  // move. A prompt edit must change these deliberately, with calibration.
  it('keeps every scoring prompt byte-identical to the pre-move text', () => {
    const digest = (prompt: string) =>
      createHash('sha256').update(prompt).digest('hex');

    expect({
      image: digest(IMAGE_SCORING_PROMPT),
      text: digest(TEXT_SCORING_PROMPT),
      video: digest(VIDEO_SCORING_PROMPT),
      vision: digest(VISION_RUBRIC_PROMPT),
    }).toEqual({
      image: 'a6bd1a2dfb3a910ce7f22292d9e4b6f1bfecde34770ed6191bb59d41f52b7742',
      text: 'f07384a942dc4d1e3f0e8a645daef0657e4ae5e8279b2ef127e6e021da54b200',
      video: '39c697c230a96d8d56d800ab62940d812573d7207f0482abdd9457ff4f2df6ad',
      vision:
        '75edf453cdf14910882234307876fd96bde286a7b703edbe2d0e031447ef2ea1',
    });
  });
});

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

  describe('scoreText', () => {
    it('sends the unchanged text scoring prompt with the production model and temperature', async () => {
      await service.scoreText('Hello', 'post');

      expect(
        mocks.llmDispatcherService.completeStructured,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              content: `${TEXT_SCORING_PROMPT}\n\nContent:\nHello`,
              role: 'user',
            },
          ],
          model: LLM_DEFAULTS.background,
          temperature: 0.3,
        }),
        undefined,
      );
    });

    it('puts the brand criteria and example sections before the content', async () => {
      await service.scoreText(
        'Hello',
        'post',
        formatScorerHarnessCriteria(
          ['Mentions the product'],
          ['Good example'],
          ['Bad example'],
        ),
      );

      const expectedPrompt = [
        TEXT_SCORING_PROMPT,
        'Brand evaluation criteria (score against these as well):\n- Mentions the product',
        'On-brand examples (content in this voice scores higher):\n- Good example',
        'Off-brand examples (content like this scores lower):\n- Bad example',
        'Content:\nHello',
      ].join('\n\n');
      expect(
        mocks.llmDispatcherService.completeStructured,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ content: expectedPrompt, role: 'user' }],
        }),
        undefined,
      );
    });
  });

  describe('formatScorerHarnessCriteria', () => {
    it('returns an empty string for empty criteria and example lists', () => {
      expect(formatScorerHarnessCriteria([], [], [])).toBe('');
    });

    it('truncates a 300-character example to 280 characters ending in an ellipsis', () => {
      const formatted = formatScorerHarnessCriteria([], ['x'.repeat(300)], []);

      expect(formatted).toBe(
        `On-brand examples (content in this voice scores higher):\n- ${'x'.repeat(279)}…`,
      );
    });
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

  describe('scoreVisionFrames (#4881)', () => {
    it('sends every frame as an image and enforces the vision rubric schema', async () => {
      mocks.llmDispatcherService.completeStructured.mockResolvedValueOnce({
        feedback: [],
        rubric: {
          artifactLevel: 'none',
          brandReadiness: 'ready',
          compositionQuality: 'strong',
          hookStrength: 'strong',
        },
        score: 8,
        suggestions: [],
      });

      await service.scoreVisionFrames({
        brandId: 'brand-1',
        imageUrls: ['https://cdn/f0.jpg', 'https://cdn/f1.jpg'],
        organizationId: 'org-1',
      });

      const [params, organizationId, callContext] =
        mocks.llmDispatcherService.completeStructured.mock.calls[0];
      expect(params.schemaName).toBe('content_quality_vision_scoring');
      expect(params.messages[1].content).toEqual([
        { image_url: { url: 'https://cdn/f0.jpg' }, type: 'image_url' },
        { image_url: { url: 'https://cdn/f1.jpg' }, type: 'image_url' },
      ]);
      expect(organizationId).toBe('org-1');
      expect(callContext).toEqual({ brandId: 'brand-1' });
    });

    it('throws instead of degrading when the model is unavailable', async () => {
      mocks.llmDispatcherService.completeStructured.mockRejectedValueOnce(
        new Error('provider down'),
      );

      await expect(
        service.scoreVisionFrames({
          imageUrls: ['https://cdn/f0.jpg'],
          organizationId: 'org-1',
        }),
      ).rejects.toThrow('provider down');
    });
  });
});
