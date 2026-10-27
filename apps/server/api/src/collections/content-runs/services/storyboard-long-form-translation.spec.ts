import { applyStoryboardLongFormTranslation } from '@api/collections/content-runs/services/storyboard-long-form-translation';
import { StoryboardLongFormTranslationService } from '@api/collections/content-runs/services/storyboard-long-form-translation.service';
import { StoryboardDraftOutputError } from '@api/collections/content-runs/services/storyboard-plan-draft';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { describe, expect, it, vi } from 'vitest';

const plan: StoryboardPlan = {
  videoModelKey: null,
  title: 'Why creators quit',
  logline: 'A short talk on consistency.',
  format: '16:9',
  runtimeBudgetSeconds: null,
  styleReferenceAssetIds: [],
  cast: [
    {
      id: 'presenter',
      name: 'Presenter',
      referenceAssetIds: [],
      avatarAssetId: 'presenter-photo',
      voiceId: 'presenter-voice',
    },
  ],
  shots: [],
  longForm: {
    runtimeBudgetSeconds: 20,
    presenterId: 'presenter',
    segments: [
      {
        id: 'segment-hook',
        ordinal: 1,
        sectionLabel: 'Hook',
        narration: 'Most creators quit in the first ninety days.',
        estimatedSeconds: 4,
        cutaways: [
          {
            id: 'cutaway-calendar',
            kind: 'still',
            brief: 'A wall calendar with crossed-out days',
            assetId: 'calendar-still',
            startSeconds: 1,
            durationSeconds: 2,
          },
        ],
      },
      {
        id: 'segment-close',
        ordinal: 2,
        narration: 'Post every day for a month.',
        estimatedSeconds: 3,
        cutaways: [],
      },
    ],
  },
};

const spanish = {
  title: 'Por qué los creadores abandonan',
  logline: 'Una charla corta sobre la constancia.',
  segments: [
    {
      segmentId: 'segment-hook',
      sectionLabel: 'Gancho',
      narration:
        'La mayoría de los creadores abandona en los primeros noventa días.',
    },
    {
      segmentId: 'segment-close',
      sectionLabel: '',
      narration: 'Publica cada día durante un mes.',
    },
  ],
};

describe('applyStoryboardLongFormTranslation', () => {
  it('swaps in the translated lines and keeps the presenter, cutaways and stills', () => {
    const translated = applyStoryboardLongFormTranslation(plan, spanish);

    expect(translated.title).toBe('Por qué los creadores abandonan');
    expect(translated.cast).toEqual(plan.cast);
    expect(translated.longForm?.presenterId).toBe('presenter');
    expect(translated.longForm?.segments.map((segment) => segment.id)).toEqual([
      'segment-hook',
      'segment-close',
    ]);
    expect(translated.longForm?.segments[0]).toMatchObject({
      sectionLabel: 'Gancho',
      narration:
        'La mayoría de los creadores abandona en los primeros noventa días.',
      cutaways: plan.longForm?.segments[0]?.cutaways,
    });
    expect(translated.longForm?.segments[1]).not.toHaveProperty('sectionLabel');
    expect(translated.longForm?.runtimeBudgetSeconds).toBe(20);
  });

  it('grows the runtime budget when the new language runs longer', () => {
    const tight = {
      ...plan,
      longForm: {
        ...(plan.longForm as NonNullable<StoryboardPlan['longForm']>),
        runtimeBudgetSeconds: 5,
      },
    };
    const budget =
      applyStoryboardLongFormTranslation(tight, spanish).longForm
        ?.runtimeBudgetSeconds ?? 0;
    expect(budget).toBeGreaterThan(5);
  });

  it('refuses a translation that drops or invents a segment', () => {
    expect(() =>
      applyStoryboardLongFormTranslation(plan, {
        ...spanish,
        segments: [spanish.segments[0] as (typeof spanish.segments)[number]],
      }),
    ).toThrow(StoryboardDraftOutputError);
    expect(() =>
      applyStoryboardLongFormTranslation(plan, {
        ...spanish,
        segments: [
          spanish.segments[0] as (typeof spanish.segments)[number],
          { segmentId: 'made-up', sectionLabel: '', narration: 'Hola.' },
        ],
      }),
    ).toThrow('missing segment segment-close');
  });
});

function setup(copySegments: number) {
  const store = {
    read: vi.fn(async () => ({
      record: {},
      config: {
        revision: 6,
        sourceSnapshot: {
          selector: {
            kind: 'brief',
            brief: 'Voice note.',
            length: 'long_form',
          },
        },
        plan,
      },
    })),
  };
  const copy = {
    id: 'run-es',
    config: {
      revision: 1,
      plan: {
        ...plan,
        longForm: {
          runtimeBudgetSeconds: 600,
          segments: plan.longForm?.segments.slice(0, copySegments) ?? [],
        },
      },
    },
  };
  const runs = {
    create: vi.fn(async () => copy),
    updatePlan: vi.fn(async () => ({ id: 'run-es', translated: true })),
  };
  const drafter = {
    translateLongForm: vi.fn(async () =>
      applyStoryboardLongFormTranslation(plan, spanish),
    ),
  };
  const service = new StoryboardLongFormTranslationService(
    store as never,
    runs as never,
    drafter as never,
  );
  return { service, store, runs, drafter };
}

const body = {
  clientRequestId: '6b1f6c2e-1c0e-4a7e-9f43-0c1d2e3f4a5b',
  expectedRevision: 6,
  language: 'es',
};

describe('StoryboardLongFormTranslationService', () => {
  it('copies the storyboard with its settings and saves the translated script', async () => {
    const ctx = setup(0);

    const result = await ctx.service.translate(
      'org-1',
      'brand-1',
      'run-1',
      'user-1',
      body,
    );

    expect(result).toEqual({ id: 'run-es', translated: true });
    expect(ctx.store.read).toHaveBeenCalledWith('org-1', 'brand-1', 'run-1', 6);
    expect(ctx.runs.create).toHaveBeenCalledWith('org-1', 'brand-1', 'user-1', {
      clientRequestId: body.clientRequestId,
      source: { kind: 'brief', brief: 'Voice note.', length: 'long_form' },
      planSettings: {
        videoModelKey: null,
        format: '16:9',
        runtimeBudgetSeconds: null,
        styleReferenceAssetIds: [],
        cast: plan.cast,
      },
    });
    const saved = ctx.runs.updatePlan.mock.calls[0] as unknown as [
      string,
      string,
      string,
      { expectedRevision: number; plan: StoryboardPlan },
    ];
    expect(saved.slice(0, 3)).toEqual(['org-1', 'brand-1', 'run-es']);
    expect(saved[3].expectedRevision).toBe(1);
    expect(saved[3].plan.longForm?.segments[0]?.narration).toBe(
      'La mayoría de los creadores abandona en los primeros noventa días.',
    );
  });

  it('returns the copy a retried request already translated', async () => {
    const ctx = setup(2);

    await ctx.service.translate('org-1', 'brand-1', 'run-1', 'user-1', body);

    expect(ctx.drafter.translateLongForm).not.toHaveBeenCalled();
    expect(ctx.runs.updatePlan).not.toHaveBeenCalled();
  });

  it('refuses an unsupported language before reading the run', async () => {
    const ctx = setup(0);

    await expect(
      ctx.service.translate('org-1', 'brand-1', 'run-1', 'user-1', {
        ...body,
        language: 'xx',
      }),
    ).rejects.toThrow('supported language');
    expect(ctx.store.read).not.toHaveBeenCalled();
  });
});
