import type { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { discardUnlinkedBreakoutDraft } from '@api/collections/outliers/services/breakout-draft-discard.util';
import type { BreakoutGenerationAdmission } from '@api/collections/outliers/services/breakout-generation-admission.util';
import { bindBreakoutMediaPostArtifact } from '@api/collections/outliers/services/breakout-media-artifact.util';
import type { BreakoutMediaOutputGenerationService } from '@api/collections/outliers/services/breakout-media-output-generation.service';
import {
  type BreakoutMediaOutputPreparationRequest,
  BreakoutMediaOutputPreparationService,
  buildBreakoutVisualPrompts,
} from '@api/collections/outliers/services/breakout-media-output-preparation.service';
import type { BreakoutOutputQualityService } from '@api/collections/outliers/services/breakout-output-quality.service';
import type { BreakoutReviewHandoffService } from '@api/collections/outliers/services/breakout-review-handoff.service';
import type { BreakoutTextOutputPreparationService } from '@api/collections/outliers/services/breakout-text-output-preparation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, Platform } from '@genfeedai/contracts';
import type { LearningFormat } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-media-artifact.util',
  () => ({
    bindBreakoutMediaPostArtifact: vi.fn(async () => ({
      status: 'bound',
      outputId: 'output-a',
      postId: 'caption-post',
    })),
  }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-draft-discard.util',
  () => ({
    discardUnlinkedBreakoutDraft: vi.fn(async () => undefined),
  }),
);

function firstArgument<T>(mock: { mock: { calls: unknown[][] } }): T {
  const argument = mock.mock.calls[0]?.[0];
  if (!argument) throw new Error('The mock was not called');
  return argument as T;
}

function fixture(
  format: LearningFormat = 'image',
  platform: Platform = Platform.INSTAGRAM,
) {
  const calls: string[] = [];
  const reauthorize = vi.fn(async (_tx: Prisma.TransactionClient) => undefined);
  const admission: BreakoutGenerationAdmission = {
    scope: {
      version: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      strategyId: 'strategy-a',
      platform,
      format,
    },
    credentialId: 'account-a',
    responseId: 'response-a',
    outputId: 'output-a',
    actorUserId: 'actor-a',
    workflowExecutionId: 'execution-a',
    componentKey: 'generation-a:caption',
    reauthorize,
  };
  const request: BreakoutMediaOutputPreparationRequest = {
    admission,
    textModelKey: 'openai/gpt-5.2',
    mediaModelKey: 'media/model',
  };
  const tx = {
    breakoutResponseOutput: {
      findFirst: vi.fn(async () => ({
        generationKey: 'generation-a',
        ordinal: 2,
      })),
    },
    post: {
      findFirst: vi.fn(async () => ({
        description: 'A concrete example of the angle, as a scene.',
      })),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) =>
        run(tx as unknown as Prisma.TransactionClient),
    ),
  };
  const model = {
    key: 'media/model',
    provider: 'fal',
    category:
      format === 'video' || format === 'short'
        ? ModelCategory.VIDEO
        : ModelCategory.IMAGE,
    isActive: true,
    isDeleted: false,
  };
  const registry = { validateModelForOrg: vi.fn(async () => model) };
  const text = {
    generate: vi.fn(
      async (input: { admission: BreakoutGenerationAdmission }) => {
        calls.push(`caption:${input.admission.componentKey}`);
        return {
          kind: 'completed' as const,
          postId: 'caption-post',
          receipt: { state: 'ready', compliance: 'passed' },
        };
      },
    ),
  };
  const media = {
    preflight: vi.fn(async () => {
      calls.push('preflight');
      return 'supported' as 'supported' | 'blocked';
    }),
    generate: vi.fn(
      async (input: { admission: BreakoutGenerationAdmission }) => {
        calls.push(`media:${input.admission.componentKey}`);
        return {
          state: 'ready' as 'ready' | 'processing' | 'reconciliation_required',
          ingredientIds: ['asset-1'],
        };
      },
    ),
  };
  const quality = {
    evaluate: vi.fn(async () => {
      calls.push('quality');
      return {
        state: 'approved' as 'approved' | 'held' | 'reconciliation_required',
        scoreId: 'score-a',
      };
    }),
  };
  const review = {
    queue: vi.fn(async () => {
      calls.push('review');
      return { turboRunId: 'run-a' };
    }),
  };
  vi.mocked(bindBreakoutMediaPostArtifact).mockImplementation(async () => {
    calls.push('compose');
    return { status: 'bound', outputId: 'output-a', postId: 'caption-post' };
  });
  const service = new BreakoutMediaOutputPreparationService(
    prisma as unknown as PrismaService,
    registry as unknown as ModelRegistrationService,
    text as unknown as BreakoutTextOutputPreparationService,
    media as unknown as BreakoutMediaOutputGenerationService,
    quality as unknown as BreakoutOutputQualityService,
    review as unknown as BreakoutReviewHandoffService,
  );
  return {
    service,
    request,
    admission,
    reauthorize,
    registry,
    text,
    media,
    quality,
    review,
    calls,
  };
}

describe('visual breakout output pipeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs the free preflight, the caption, the visual, the composition and the quality gate in order', async () => {
    const h = fixture('image');
    expect(await h.service.generate(h.request)).toEqual({
      kind: 'completed',
      postId: 'caption-post',
    });
    expect(h.calls).toEqual([
      'preflight',
      'caption:generation-a:caption',
      'media:generation-a:media:1',
      'compose',
      'quality',
    ]);
    expect(h.media.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'fal',
        prompts: [expect.stringContaining('follow-up 2')],
        settings: {
          model: 'media/model',
          aspectRatio: '1:1',
          width: 1024,
          height: 1024,
        },
      }),
    );
    expect(h.review.queue).not.toHaveBeenCalled();
    expect(bindBreakoutMediaPostArtifact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outputId: 'output-a',
        postId: 'caption-post',
        credentialId: 'account-a',
      }),
    );
  });

  it('derives every prompt from the finished caption, one per visual', async () => {
    const h = fixture('carousel');
    await h.service.generate(h.request);
    const { prompts } = firstArgument<{ prompts: string[] }>(h.media.generate);
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain('slide 2 of 3');
    expect(
      prompts.every((prompt) => prompt.includes('A concrete example')),
    ).toBe(true);
  });

  it.each([
    ['video', Platform.YOUTUBE, 16, 'video'],
    ['short', Platform.TIKTOK, 9, 'vertical short-form video'],
  ] as const)(
    'asks for a %s of the planned length without an image aspect ratio',
    async (format, platform, _ratio, phrase) => {
      const h = fixture(format, platform);
      await h.service.generate(h.request);
      const call = firstArgument<{
        prompts: string[];
        settings: Record<string, unknown>;
      }>(h.media.generate);
      expect(call.settings).toMatchObject({
        model: 'media/model',
        duration: 10,
      });
      expect(call.settings).not.toHaveProperty('aspectRatio');
      expect(call.prompts[0]).toContain(phrase);
    },
  );

  it('queues a post whose caption needs brand review after composing it, still generates and scores it', async () => {
    const h = fixture('image');
    h.text.generate.mockResolvedValue({
      kind: 'completed',
      postId: 'caption-post',
      receipt: { state: 'needs_review', compliance: 'unverified' },
    });
    expect(await h.service.generate(h.request)).toMatchObject({
      kind: 'completed',
    });
    expect(h.calls).toEqual([
      'preflight',
      'caption:generation-a:caption',
      'media:generation-a:media:1',
      'compose',
      'review',
      'quality',
    ]);
    expect(h.review.queue).toHaveBeenCalledWith(h.admission, {
      postId: 'caption-post',
      generationKey: 'generation-a',
    });
  });

  it('spends nothing on a visual when the brand cannot use the model', async () => {
    const h = fixture('image');
    h.media.preflight.mockResolvedValue('blocked');
    expect(await h.service.generate(h.request)).toEqual({
      kind: 'stopped',
      reasonCode: 'media_brand_capability_unavailable',
    });
    expect(h.text.generate).not.toHaveBeenCalled();
    expect(h.media.generate).not.toHaveBeenCalled();
  });

  it('holds an unsupported platform/format before any model or paid read', async () => {
    const h = fixture('image', Platform.YOUTUBE);
    expect(await h.service.generate(h.request)).toEqual({
      kind: 'stopped',
      reasonCode: 'format_unsupported_for_platform',
    });
    expect(h.registry.validateModelForOrg).not.toHaveBeenCalled();
    expect(h.text.generate).not.toHaveBeenCalled();
  });

  it('stops before the visual when the caption is in flight or stopped', async () => {
    const h = fixture('image');
    h.text.generate.mockResolvedValueOnce({
      kind: 'in_progress',
    } as unknown as Awaited<ReturnType<typeof h.text.generate>>);
    expect(await h.service.generate(h.request)).toEqual({
      kind: 'in_progress',
      reasonCode: 'provider_outcome_pending',
    });
    h.text.generate.mockResolvedValueOnce({
      kind: 'stopped',
      reasonCode: 'brand_validation_blocked',
    } as unknown as Awaited<ReturnType<typeof h.text.generate>>);
    expect(await h.service.generate(h.request)).toEqual({
      kind: 'stopped',
      reasonCode: 'brand_validation_blocked',
    });
    expect(h.media.generate).not.toHaveBeenCalled();
  });

  it('holds a source without words instead of failing the response', async () => {
    const h = fixture('image');
    h.text.generate.mockRejectedValueOnce(
      new ConflictException('breakout_source_text_unavailable'),
    );
    expect(await h.service.generate(h.request)).toEqual({
      kind: 'stopped',
      reasonCode: 'source_text_unavailable',
    });
    h.text.generate.mockRejectedValueOnce(new ConflictException('other'));
    await expect(h.service.generate(h.request)).rejects.toThrow('other');
  });

  it.each(['processing', 'reconciliation_required'] as const)(
    'does not compose or score while the visual is %s',
    async (state) => {
      const h = fixture('video', Platform.YOUTUBE);
      h.media.generate.mockResolvedValue({ state, ingredientIds: ['asset-1'] });
      expect(await h.service.generate(h.request)).toEqual({
        kind: 'in_progress',
        reasonCode: 'provider_outcome_pending',
      });
      expect(bindBreakoutMediaPostArtifact).not.toHaveBeenCalled();
      expect(h.quality.evaluate).not.toHaveBeenCalled();
    },
  );

  it('discards the unlinked caption draft when the visuals cannot be composed', async () => {
    const h = fixture('image');
    vi.mocked(bindBreakoutMediaPostArtifact).mockResolvedValueOnce({
      status: 'held',
      reason: 'source_changed',
    });
    expect(await h.service.generate(h.request)).toEqual({
      kind: 'stopped',
      reasonCode: 'artifact_source_changed',
    });
    expect(discardUnlinkedBreakoutDraft).toHaveBeenCalledWith(
      expect.anything(),
      h.admission,
      'caption-post',
    );
    expect(h.quality.evaluate).not.toHaveBeenCalled();
  });

  it('keeps an unreconciled quality evaluation as in progress', async () => {
    const h = fixture('image');
    h.quality.evaluate.mockResolvedValue({
      state: 'reconciliation_required',
      scoreId: 'score-a',
    });
    expect(await h.service.generate(h.request)).toEqual({
      kind: 'in_progress',
      reasonCode: 'quality_evaluation_pending',
    });
  });

  it('refuses a model of the wrong category or an inactive one before any paid step', async () => {
    const h = fixture('image');
    h.registry.validateModelForOrg.mockResolvedValueOnce({
      key: 'media/model',
      provider: 'fal',
      category: ModelCategory.VIDEO,
      isActive: true,
      isDeleted: false,
    });
    await expect(h.service.generate(h.request)).rejects.toThrow(
      'breakout_media_model_unavailable',
    );
    expect(h.text.generate).not.toHaveBeenCalled();
  });

  it('keeps asserting the model on every continuation of the visual step', async () => {
    const h = fixture('image');
    await h.service.generate(h.request);
    const guarded = firstArgument<{ admission: BreakoutGenerationAdmission }>(
      h.media.generate,
    ).admission;
    h.registry.validateModelForOrg.mockClear();
    await guarded.reauthorize({} as Prisma.TransactionClient);
    expect(h.registry.validateModelForOrg).toHaveBeenCalledWith(
      'media/model',
      'org-a',
    );
    h.registry.validateModelForOrg.mockRejectedValueOnce(
      new Error('model removed'),
    );
    await expect(
      guarded.reauthorize({} as Prisma.TransactionClient),
    ).rejects.toThrow('model removed');
  });
});

describe('visual prompts', () => {
  it('are deterministic and bounded by the caption they come from', () => {
    const plan = {
      format: 'image',
      modelCategory: ModelCategory.IMAGE,
      mediaKind: 'image',
      parts: 1,
      postCategory: 'IMAGE',
      aspectRatio: '1:1',
      height: 1024,
      width: 1024,
      durationSeconds: null,
    } as unknown as Parameters<typeof buildBreakoutVisualPrompts>[1];
    const caption = 'x'.repeat(5000);
    const first = buildBreakoutVisualPrompts(caption, plan, 3);
    expect(first).toEqual(buildBreakoutVisualPrompts(caption, plan, 3));
    expect(first[0]?.length).toBeLessThan(2500);
  });
});
