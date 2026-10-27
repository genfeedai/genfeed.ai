import { StoryboardLongFormEstimateService } from '@api/collections/content-runs/services/storyboard-long-form-estimate.service';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

function setup(isLongForm = true) {
  const store = {
    read: vi.fn(async () => ({
      record: {},
      config: {
        revision: 4,
        plan: isLongForm ? { longForm: { segments: [] } } : {},
      },
    })),
  };
  const stills = {
    estimateCutaways: vi.fn(async () => ({
      parts: 6,
      credits: 12,
      billingMode: 'platform' as const,
    })),
  };
  const aRoll = {
    estimate: vi.fn(async (track: string) => {
      if (track === 'aRoll')
        throw new ConflictException('Choose a presenter voice first.');
      return { parts: 2, credits: 3, seconds: 300, billingMode: 'byok' };
    }),
  };
  const service = new StoryboardLongFormEstimateService(
    store as never,
    stills as never,
    aRoll as never,
  );
  return { service, store };
}

describe('StoryboardLongFormEstimateService', () => {
  it('adds up every step and says why a step has no price yet', async () => {
    const ctx = setup();

    const estimate = await ctx.service.estimate(
      'org-1',
      'brand-1',
      'run-1',
      'user-1',
      { expectedRevision: 4 },
    );

    expect(estimate).toEqual({
      revision: 4,
      billingMode: 'mixed',
      cutaways: { parts: 6, credits: 12 },
      animatic: { parts: 2, credits: 3, seconds: 300 },
      presenter: {
        parts: 0,
        credits: 0,
        problem: 'Choose a presenter voice first.',
      },
      totalCredits: 15,
    });
    expect(ctx.store.read).toHaveBeenCalledWith('org-1', 'brand-1', 'run-1', 4);
  });

  it('refuses a short-form storyboard and a missing revision', async () => {
    await expect(
      setup(false).service.estimate('org-1', 'brand-1', 'run-1', 'user-1', {
        expectedRevision: 4,
      }),
    ).rejects.toThrow('Only a long-form storyboard');
    await expect(
      setup().service.estimate('org-1', 'brand-1', 'run-1', 'user-1', {}),
    ).rejects.toThrow('expectedRevision');
  });
});
