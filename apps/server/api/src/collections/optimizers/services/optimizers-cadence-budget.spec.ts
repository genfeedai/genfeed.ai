import type { OptimizerAnalysisContinuation } from '@api/collections/optimizers/services/optimizer-analysis-continuation.types';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { buildReplicateStructuredPrompt } from '@api/services/integrations/llm/replicate-structured-prompt.util';
import type { ReplicateStructuredTextParams } from '@api/services/integrations/replicate/dto/replicate-structured-text.dto';
import {
  CONTENT_ANALYSIS_SCHEMA_NAME,
  contentAnalysisSchema,
} from '@genfeedai/contracts/api-types/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  const dispatched = vi.fn();
  const model = {
    findOne: vi.fn().mockResolvedValue({ pricingType: 'flat', cost: 2 }),
  };
  const replicate = {
    generateStructuredTextSync: vi
      .fn()
      .mockImplementation(
        async (
          _key: string,
          params: ReplicateStructuredTextParams<unknown>,
        ) => {
          const input = {
            prompt: 'Bounded quality fixture',
            max_completion_tokens: 2048,
          };
          for (let attempt = 0; attempt < 2; attempt++) {
            await params.beforeAttempt?.(input);
            dispatched();
            await params.onAttempt?.(input, '{}');
          }
          return { overallScore: 90, breakdown: {}, suggestions: [] };
        },
      ),
  };
  const prisma = {
    contentScore: {
      create: vi.fn(async (input: Prisma.ContentScoreCreateArgs) => ({
        id: 'score',
        ...input.data,
      })),
    },
  };
  const service = Reflect.construct(OptimizersService, [
    prisma,
    { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), log: vi.fn() },
    model,
    replicate,
  ]) as OptimizersService;
  return { service, dispatched, model, prisma };
}
function continuation(): OptimizerAnalysisContinuation {
  return {
    reauthorize: vi.fn(async () => undefined),
    beforeAttempt: vi.fn(async () => undefined),
    acceptedAttempt: vi.fn(async () => undefined),
    scoreBinding: {
      responseId: 'response-a',
      outputId: 'output-a',
      postId: 'post-a',
      strategyId: 'strategy-a',
      workflowExecutionId: 'execution-a',
      materialHash: `sha256:${'a'.repeat(64)}`,
    },
  };
}
describe('cadence quality budget admission', () => {
  it('quotes the actual schema-wrapped input without a provider call or score write', async () => {
    const s = setup();
    const pricing = {
      pricingType: 'per-token',
      cost: 0,
      inputCostPerMillionTokens: 1000,
      outputCostPerMillionTokens: 1000,
    };
    s.model.findOne.mockResolvedValueOnce(pricing);
    const reauthorize = vi.fn(async () => undefined);
    const dto = {
      content: 'Actual content',
      contentType: 'caption' as const,
      platform: 'twitter',
      goals: ['reach'],
    };
    const prompt = `Analyze this caption content for twitter focusing on: reach.

Content: "Actual content"

Score each aspect 0-100. Provide actionable suggestions with a category,
a type, a priority, and — where you are rewriting a line — the original and
suggested text.`;
    expect(await s.service.estimateAnalysisCredits(dto, reauthorize)).toBe(
      calculateEstimatedTextCredits(
        pricing,
        {
          max_completion_tokens: 2048,
          prompt: buildReplicateStructuredPrompt(
            prompt,
            contentAnalysisSchema,
            CONTENT_ANALYSIS_SCHEMA_NAME,
          ),
        },
        'x'.repeat(2048 * 4),
      ),
    );
    expect(reauthorize).toHaveBeenCalledTimes(2);
    expect(s.dispatched).not.toHaveBeenCalled();
    expect(s.prisma.contentScore.create).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { pricingType: 'flat', cost: null },
    { pricingType: 'per-token', inputCostPerMillionTokens: 1 },
  ])(
    'never invents a zero quality estimate for unavailable pricing %j',
    async (price) => {
      const s = setup();
      s.model.findOne.mockResolvedValueOnce(price);
      await expect(
        s.service.estimateAnalysisCredits(
          { content: 'Bounded', contentType: 'caption' },
          async () => undefined,
        ),
      ).rejects.toThrow();
      expect(s.dispatched).not.toHaveBeenCalled();
    },
  );
  it('propagates quote-time revocation after the private catalog read', async () => {
    const s = setup();
    const reauthorize = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error('revoked'));
    await expect(
      s.service.estimateAnalysisCredits(
        { content: 'Bounded', contentType: 'caption' },
        reauthorize,
      ),
    ).rejects.toThrow('revoked');
    expect(s.model.findOne).not.toHaveBeenCalled();
    reauthorize
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('revoked after quote'));
    await expect(
      s.service.estimateAnalysisCredits(
        { content: 'Bounded', contentType: 'caption' },
        reauthorize,
      ),
    ).rejects.toThrow('revoked after quote');
    expect(s.dispatched).not.toHaveBeenCalled();
  });
  it('admits each actual maximum quote and persists only the server-supplied score binding', async () => {
    const s = setup(),
      trusted = continuation();
    await s.service.analyzeContent(
      { content: 'Actual content', contentType: 'caption' },
      'organization',
      'user',
      undefined,
      10,
      trusted,
    );
    expect(trusted.beforeAttempt).toHaveBeenNthCalledWith(1, 2);
    expect(trusted.beforeAttempt).toHaveBeenNthCalledWith(2, 2);
    expect(trusted.acceptedAttempt).toHaveBeenCalledTimes(2);
    expect(s.prisma.contentScore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'organization',
          data: expect.objectContaining({
            breakoutQuality: trusted.scoreBinding,
          }),
        }),
      }),
    );
  });
  it('denies the current actor before any provider call or score write', async () => {
    const s = setup(),
      trusted = continuation();
    vi.mocked(trusted.reauthorize).mockRejectedValueOnce(new Error('revoked'));
    await expect(
      s.service.analyzeContent(
        { content: 'Content', contentType: 'caption' },
        'organization',
        'user',
        undefined,
        10,
        trusted,
      ),
    ).rejects.toThrow('revoked');
    expect(s.model.findOne).not.toHaveBeenCalled();
    expect(s.dispatched).not.toHaveBeenCalled();
    expect(s.prisma.contentScore.create).not.toHaveBeenCalled();
  });
  it('records actual accepted cost then propagates revocation before score persistence', async () => {
    const s = setup(),
      trusted = continuation();
    let checks = 0;
    vi.mocked(trusted.reauthorize).mockImplementation(async () => {
      if (++checks === 4) throw new Error('revoked after provider');
    });
    await expect(
      s.service.analyzeContent(
        { content: 'Content', contentType: 'caption' },
        'organization',
        'user',
        undefined,
        10,
        trusted,
      ),
    ).rejects.toThrow('revoked after provider');
    expect(s.dispatched).toHaveBeenCalledOnce();
    expect(trusted.acceptedAttempt).toHaveBeenCalledWith(2);
    expect(s.prisma.contentScore.create).not.toHaveBeenCalled();
  });
  it('holds missing model prices before dispatch', async () => {
    const s = setup();
    s.model.findOne.mockResolvedValueOnce(null);
    await expect(
      s.service.analyzeContent(
        { content: 'Content', contentType: 'caption' },
        'organization',
        'user',
        vi.fn(),
        10,
      ),
    ).rejects.toThrow();
    expect(s.dispatched).not.toHaveBeenCalled();
  });
  it.each([0, 1, Number.NaN])(
    'holds before the first prediction at insufficient cap (%s)',
    async (cap) => {
      const s = setup();
      const billing = vi.fn();
      await expect(
        s.service.analyzeContent(
          { content: 'Content', contentType: 'caption' },
          'organization',
          'user',
          billing,
          cap,
        ),
      ).rejects.toThrow();
      expect(s.dispatched).not.toHaveBeenCalled();
      expect(billing).not.toHaveBeenCalled();
    },
  );
  it('bills the first attempt and refuses a repair that exceeds remaining credits', async () => {
    const s = setup();
    const billing = vi.fn();
    await expect(
      s.service.analyzeContent(
        { content: 'Content', contentType: 'caption' },
        'organization',
        'user',
        billing,
        3,
      ),
    ).rejects.toThrow();
    expect(s.dispatched).toHaveBeenCalledOnce();
    expect(billing).toHaveBeenCalledWith(2);
  });
  it('allows a bounded repair and reports every actual charge', async () => {
    const s = setup();
    const billing = vi.fn();
    expect(
      await s.service.analyzeContent(
        { content: 'Content', contentType: 'caption' },
        'organization',
        'user',
        billing,
        4,
      ),
    ).toMatchObject({ data: { overallScore: 90 } });
    expect(s.dispatched).toHaveBeenCalledTimes(2);
    expect(billing.mock.calls).toEqual([[2], [2]]);
  });
});
