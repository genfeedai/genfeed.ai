import type { BreakoutGenerationAdmission } from '@api/collections/outliers/services/breakout-generation-admission.util';
import {
  BreakoutReviewHandoffService,
  breakoutReviewItemFormat,
} from '@api/collections/outliers/services/breakout-review-handoff.service';
import type { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Platform } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

function fixture(
  reviewTurboRunId: string | null = null,
  found = true,
  format: BreakoutGenerationAdmission['scope']['format'] = 'text',
  ingredients: Array<{ cdnUrl: string }> = [],
) {
  const admission: BreakoutGenerationAdmission = {
    scope: {
      version: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      strategyId: 'strategy-a',
      platform: Platform.TWITTER,
      format,
    },
    credentialId: 'account-a',
    responseId: 'response-a',
    outputId: 'output-a',
    actorUserId: 'actor-a',
    workflowExecutionId: 'execution-a',
    componentKey: 'generation-a:caption',
    reauthorize: vi.fn(async () => undefined),
  };
  const findFirst = vi.fn(async () =>
    found
      ? {
          description: 'A useful follow-up.',
          label: 'Breakout follow-up',
          promptUsed: null,
          reviewTurboRunId,
          ingredients,
        }
      : null,
  );
  const createManualReviewTurboRun = vi.fn(async () => ({ id: 'run-a' }));
  const service = new BreakoutReviewHandoffService(
    { post: { findFirst } } as unknown as PrismaService,
    { createManualReviewTurboRun } as unknown as TurboRunService,
  );
  return { admission, findFirst, createManualReviewTurboRun, service };
}

describe('breakout review handoff', () => {
  it('links the already-created canonical draft into a manual review run under the original actor', async () => {
    const h = fixture();
    expect(
      await h.service.queue(h.admission, {
        postId: 'post-a',
        generationKey: 'generation-a',
      }),
    ).toEqual({ turboRunId: 'run-a' });
    expect(h.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'post-a',
        organizationId: 'org-a',
        brandId: 'brand-a',
        credentialId: 'account-a',
        breakoutOutputId: 'output-a',
        isDeleted: false,
      }),
      select: expect.any(Object),
    });
    expect(h.createManualReviewTurboRun).toHaveBeenCalledWith(
      {
        agentStrategyId: 'strategy-a',
        brandId: 'brand-a',
        items: [
          expect.objectContaining({
            caption: 'A useful follow-up.',
            format: 'post',
            platform: 'twitter',
            postId: 'post-a',
            sourceActionId: 'generation-a',
          }),
        ],
      },
      'actor-a',
      'org-a',
    );
  });

  it('is idempotent: a draft already in a review run is left where it is', async () => {
    const h = fixture('run-existing');
    expect(
      await h.service.queue(h.admission, {
        postId: 'post-a',
        generationKey: 'generation-a',
      }),
    ).toBeNull();
    expect(h.createManualReviewTurboRun).not.toHaveBeenCalled();
  });

  it('refuses a draft that is not the output’s own linked post', async () => {
    const h = fixture(null, false);
    await expect(
      h.service.queue(h.admission, {
        postId: 'post-a',
        generationKey: 'generation-a',
      }),
    ).rejects.toThrow('breakout_review_draft_unavailable');
    expect(h.createManualReviewTurboRun).not.toHaveBeenCalled();
  });

  it.each([
    ['image', 'image'],
    ['carousel', 'carousel'],
    ['video', 'video'],
    ['short', 'reel'],
    ['text', 'post'],
    ['thread', 'post'],
  ] as const)(
    'queues a %s output as a %s review item with its first visual as the preview',
    async (format, itemFormat) => {
      const media = format !== 'text' && format !== 'thread';
      const h = fixture(
        null,
        true,
        format,
        media ? [{ cdnUrl: 'https://cdn.test/asset-1' }] : [],
      );
      await h.service.queue(h.admission, {
        postId: 'post-a',
        generationKey: 'generation-a',
      });
      expect(breakoutReviewItemFormat(format)).toBe(itemFormat);
      const [dto] = h.createManualReviewTurboRun.mock.calls[0] as unknown as [
        { items: Array<Record<string, unknown>> },
      ];
      expect(dto.items[0]).toMatchObject({ format: itemFormat });
      if (media)
        expect(dto.items[0]).toMatchObject({
          mediaUrl: 'https://cdn.test/asset-1',
        });
      else expect(dto.items[0]).not.toHaveProperty('mediaUrl');
    },
  );
});
