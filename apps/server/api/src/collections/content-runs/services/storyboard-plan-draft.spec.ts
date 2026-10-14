import {
  assembleStoryboardDraft,
  fitStoryboardDurations,
  type StoryboardDraftOutput,
  type StoryboardDraftRequest,
  storyboardMaxShots,
} from '@api/collections/content-runs/services/storyboard-plan-draft';
import { StoryboardPlanDraftService } from '@api/collections/content-runs/services/storyboard-plan-draft.service';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const emptyPlan: StoryboardPlan = {
  videoModelKey: null,
  title: '',
  logline: '',
  format: '9:16',
  runtimeBudgetSeconds: 12,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [],
};

function drafted(
  overrides: Partial<StoryboardDraftOutput['shots'][number]> = {},
): StoryboardDraftOutput['shots'][number] {
  return {
    existingShotId: null,
    sectionLabel: 'Open',
    action: 'A hand lifts the product.',
    dialogue: null,
    speakerId: null,
    isSpokenOnScreen: false,
    durationSeconds: 5,
    ...overrides,
  };
}

function request(
  overrides: Partial<StoryboardDraftRequest> = {},
): StoryboardDraftRequest {
  return {
    brand: { name: 'Acme' },
    brief: 'Launch the new bottle.',
    current: emptyPlan,
    mode: 'draft',
    model: { hasInterpolation: false, supportedDurationsSeconds: [4, 6, 8] },
    runtimeBudgetSeconds: 12,
    ...overrides,
  };
}

describe('fitStoryboardDurations', () => {
  it('snaps to supported lengths and lets the lower one win ties', () => {
    expect(fitStoryboardDurations([5, 7.2], [4, 6, 8], 30)).toEqual([4, 8]);
  });

  it('shortens the longest shots until the total fits the budget', () => {
    const fitted = fitStoryboardDurations([8, 8, 8], [4, 6, 8], 18);
    expect(fitted.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(
      18,
    );
    expect(fitted.every((value) => [4, 6, 8].includes(value))).toBe(true);
  });

  it('rejects a budget that cannot hold the shots at the shortest length', () => {
    expect(() => fitStoryboardDurations([4, 4, 4], [4, 6], 11)).toThrow(
      ConflictException,
    );
  });

  it('caps the shot count by the budget and the contract', () => {
    expect(storyboardMaxShots([4, 6], 30)).toBe(7);
    expect(storyboardMaxShots([1], 60)).toBe(12);
  });
});

describe('assembleStoryboardDraft', () => {
  it('creates new shots with fresh ids, cut transitions and no stills', () => {
    const plan = assembleStoryboardDraft(request(), {
      title: 'Bottle launch',
      logline: 'A bottle changes the day.',
      shots: [drafted(), drafted({ sectionLabel: 'Close' })],
    });
    expect(plan.shots.map((shot) => shot.ordinal)).toEqual([1, 2]);
    expect(new Set(plan.shots.map((shot) => shot.id)).size).toBe(2);
    for (const shot of plan.shots) {
      expect(shot).toMatchObject({
        transition: 'cut',
        stillFreshness: 'missing',
        onScreenSpeaker: false,
      });
      expect(shot.stillAssetId).toBeUndefined();
    }
    expect(plan.runtimeBudgetSeconds).toBe(12);
    expect(plan.shots.map((shot) => shot.durationSeconds)).toEqual([4, 4]);
  });

  it('keeps the seeded still on the first shot', () => {
    const plan = assembleStoryboardDraft(
      request({
        current: {
          ...emptyPlan,
          shots: [
            {
              id: 'seed',
              ordinal: 1,
              action: '',
              onScreenSpeaker: false,
              durationSeconds: null,
              stillAssetId: 'image-1',
              stillFreshness: 'stale',
              transition: 'cut',
            },
          ],
        },
      }),
      { title: 'T', logline: '', shots: [drafted(), drafted()] },
    );
    expect(plan.shots[0]).toMatchObject({
      id: 'seed',
      stillAssetId: 'image-1',
    });
  });

  it('adds a voiceless narrator when dialogue has no cast', () => {
    const plan = assembleStoryboardDraft(request(), {
      title: 'T',
      logline: '',
      shots: [
        drafted({ dialogue: 'Meet the bottle.', isSpokenOnScreen: true }),
        drafted(),
      ],
    });
    expect(plan.cast).toHaveLength(1);
    expect(plan.cast[0]).toMatchObject({ name: 'Narrator' });
    expect(plan.cast[0].voiceId).toBeUndefined();
    expect(plan.shots[0]).toMatchObject({
      dialogue: 'Meet the bottle.',
      speakerId: plan.cast[0].id,
      onScreenSpeaker: false,
    });
  });

  it('uses a named cast member and drops dialogue with an unknown speaker', () => {
    const cast = [
      { id: 'ana', name: 'Ana', avatarAssetId: 'av-1', referenceAssetIds: [] },
      { id: 'bo', name: 'Bo', referenceAssetIds: [] },
    ];
    const plan = assembleStoryboardDraft(
      request({ current: { ...emptyPlan, cast } }),
      {
        title: 'T',
        logline: '',
        shots: [
          drafted({
            dialogue: 'Hi.',
            speakerId: 'ana',
            isSpokenOnScreen: true,
          }),
          drafted({ dialogue: 'Lost line.', speakerId: 'nobody' }),
        ],
      },
    );
    expect(plan.cast).toEqual(cast);
    expect(plan.shots[0]).toMatchObject({
      speakerId: 'ana',
      onScreenSpeaker: true,
    });
    expect(plan.shots[1].dialogue).toBeUndefined();
    expect(plan.shots[1].speakerId).toBeUndefined();
  });

  it('rejects more shots than the budget allows', () => {
    expect(() =>
      assembleStoryboardDraft(request({ runtimeBudgetSeconds: 8 }), {
        title: 'T',
        logline: '',
        shots: [drafted(), drafted(), drafted()],
      }),
    ).toThrow();
  });

  it('keeps ids and notes of referenced shots when revising', () => {
    const current: StoryboardPlan = {
      ...emptyPlan,
      shots: [
        {
          id: 'a',
          ordinal: 1,
          action: 'Old',
          notes: 'private',
          onScreenSpeaker: false,
          durationSeconds: 4,
          stillAssetId: 'image-a',
          stillFreshness: 'fresh',
          transition: 'stitch',
        },
        {
          id: 'b',
          ordinal: 2,
          action: 'Gone',
          onScreenSpeaker: false,
          durationSeconds: 4,
          stillFreshness: 'missing',
          transition: 'cut',
        },
      ],
    };
    const plan = assembleStoryboardDraft(
      request({ current, mode: 'revise', instruction: 'Add a finale' }),
      {
        title: 'T',
        logline: '',
        shots: [
          drafted({ existingShotId: 'a', action: 'Old' }),
          drafted({ existingShotId: 'missing-id', action: 'Finale' }),
        ],
      },
    );
    expect(plan.shots[0]).toMatchObject({
      id: 'a',
      notes: 'private',
      stillAssetId: 'image-a',
      transition: 'stitch',
    });
    expect(plan.shots[1].id).not.toBe('missing-id');
    expect(plan.shots.map((shot) => shot.id)).not.toContain('b');
  });
});

describe('StoryboardPlanDraftService', () => {
  const output: StoryboardDraftOutput = {
    title: 'Bottle launch',
    logline: '',
    shots: [drafted(), drafted()],
  };
  function build(content: string | Error) {
    const chatCompletion = vi.fn(async () => {
      if (content instanceof Error) throw content;
      return { choices: [{ message: { content } }] };
    });
    const error = vi.fn();
    const service = new StoryboardPlanDraftService(
      { chatCompletion } as never,
      { error } as never,
    );
    return { service, chatCompletion, error };
  }

  it('asks for structured output and returns a fitted plan', async () => {
    const { service, chatCompletion } = build(JSON.stringify(output));
    const plan = await service.draft(request());
    expect(plan.shots).toHaveLength(2);
    expect(chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: expect.objectContaining({ type: 'json_schema' }),
      }),
    );
  });

  it.each([
    ['provider failure', new Error('upstream 500')],
    ['non-JSON output', 'not json'],
    ['schema-invalid output', JSON.stringify({ title: 'T' })],
  ])('maps %s to a retryable error', async (_name, content) => {
    const { service, error } = build(content);
    await expect(service.draft(request())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(error).toHaveBeenCalled();
  });

  it('fails before calling the model when the budget cannot hold two shots', async () => {
    const { service, chatCompletion } = build(JSON.stringify(output));
    await expect(
      service.draft(request({ runtimeBudgetSeconds: 6 })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(chatCompletion).not.toHaveBeenCalled();
  });
});
