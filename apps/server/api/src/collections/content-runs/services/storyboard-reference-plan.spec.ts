import { StoryboardDraftOutputError } from '@api/collections/content-runs/services/storyboard-plan-draft';
import {
  assembleReversedImagePlan,
  assembleReversedVideoPlan,
  referenceRuntimeBudgetSeconds,
} from '@api/collections/content-runs/services/storyboard-reference-plan';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type {
  ReferenceImageAnalysis,
  ReferenceVideoAnalysis,
} from '@genfeedai/contracts/api-types/contracts/storyboard-reference-analysis.contract';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const model = { hasInterpolation: false, supportedDurationsSeconds: [4, 6, 8] };

const emptyPlan: StoryboardPlan = {
  videoModelKey: null,
  title: '',
  logline: '',
  format: '9:16',
  runtimeBudgetSeconds: null,
  cast: [],
  styleReferenceAssetIds: [],
  shots: [],
};

const style = {
  label: 'Warm studio, soft grain',
  palette: ['cream', 'walnut'],
  lighting: 'soft window light from the left',
  lens: 'normal lens',
  grade: 'lifted blacks, fine grain',
  typography: 'bold sans-serif, white',
};

const videoAnalysis: ReferenceVideoAnalysis = {
  title: 'Pilates at home',
  logline: 'A first session on the reformer.',
  style,
  shots: [
    {
      sectionLabel: 'Settle in',
      startSeconds: 0,
      endSeconds: 3.2,
      action: 'She sits on the reformer.',
      cuts: [],
      sfx: [],
      referenceRoles: [],
      overlays: [],
      videoPrompt: 'Wide side-on shot of a woman settling onto a reformer.',
    },
    {
      sectionLabel: 'The slide',
      startSeconds: 3.2,
      endSeconds: 9,
      action: 'She slides the carriage out on one breath.',
      cuts: [
        {
          startSeconds: 0,
          endSeconds: 2.5,
          framing: 'wide side-on',
          camera: 'static',
        },
        {
          startSeconds: 2.5,
          endSeconds: 5.8,
          framing: 'close-up on the legs',
          camera: 'slow push in',
        },
      ],
      sfx: ['soft spring creak', 'breath'],
      referenceRoles: [{ role: 'character_face', label: 'Shayla' }],
      overlays: [
        {
          text: 'Day 1',
          startSeconds: 0.4,
          endSeconds: 3,
          position: 'top center',
          arrival: 'word by word',
        },
      ],
      videoPrompt: 'Close-up push in on legs as the carriage slides out.',
    },
    {
      sectionLabel: 'Finish',
      startSeconds: 9,
      endSeconds: 14.2,
      action: 'She smiles and stands.',
      cuts: [],
      sfx: [],
      referenceRoles: [],
      overlays: [],
      videoPrompt: 'Medium shot of a woman standing and smiling.',
    },
  ],
};

const imageAnalysis: ReferenceImageAnalysis = {
  title: 'Golden-hour portrait',
  style,
  composition: 'Subject on the left third, shallow depth, eye-level.',
  referenceRoles: [{ role: 'environment', label: 'Rooftop' }],
  overlays: [
    {
      text: 'NEW',
      startSeconds: null,
      endSeconds: null,
      position: 'top right',
      arrival: '',
    },
  ],
  prompt: 'A portrait at golden hour on a rooftop, subject on the left third.',
};

describe('assembleReversedVideoPlan', () => {
  it('maps takes to shots with fitted durations, cuts, sound, prompt and notes', () => {
    const plan = assembleReversedVideoPlan(
      { current: emptyPlan, model, runtimeBudgetSeconds: 30 },
      videoAnalysis,
    );
    expect(plan.title).toBe('Pilates at home');
    expect(plan.styleLabel).toBe('Warm studio, soft grain');
    expect(plan.runtimeBudgetSeconds).toBe(30);
    expect(
      plan.shots.map(({ ordinal, sectionLabel, durationSeconds }) => ({
        ordinal,
        sectionLabel,
        durationSeconds,
      })),
    ).toEqual([
      { ordinal: 1, sectionLabel: 'Settle in', durationSeconds: 4 },
      { ordinal: 2, sectionLabel: 'The slide', durationSeconds: 6 },
      { ordinal: 3, sectionLabel: 'Finish', durationSeconds: 6 },
    ]);
    const slide = plan.shots[1];
    expect(slide.cuts).toEqual([
      {
        startSeconds: 0,
        endSeconds: 2.5,
        framing: 'wide side-on',
        camera: 'static',
      },
      {
        startSeconds: 2.5,
        endSeconds: 5.8,
        framing: 'close-up on the legs',
        camera: 'slow push in',
      },
    ]);
    expect(slide.sfx).toEqual(['soft spring creak', 'breath']);
    expect(slide.videoPrompt).toBe(
      'Close-up push in on legs as the carriage slides out.',
    );
    expect(slide.notes).toBe(
      'On-screen text: "Day 1" 0.4-3.0 s, top center, word by word\nNeeds: character_face Shayla',
    );
    expect(plan.shots[0].cuts).toBeUndefined();
    expect(plan.shots[0].notes).toBeUndefined();
  });

  it('keeps the cast and style references of the plan', () => {
    const plan = assembleReversedVideoPlan(
      {
        current: {
          ...emptyPlan,
          cast: [{ id: 'mia', name: 'Mia', referenceAssetIds: ['face-1'] }],
          styleReferenceAssetIds: ['style-1'],
        },
        model,
        runtimeBudgetSeconds: 30,
      },
      videoAnalysis,
    );
    expect(plan.cast).toEqual([
      { id: 'mia', name: 'Mia', referenceAssetIds: ['face-1'] },
    ]);
    expect(plan.styleReferenceAssetIds).toEqual(['style-1']);
  });

  it('refuses more shots than the runtime holds', () => {
    expect(() =>
      assembleReversedVideoPlan(
        { current: emptyPlan, model, runtimeBudgetSeconds: 8 },
        videoAnalysis,
      ),
    ).toThrow(StoryboardDraftOutputError);
  });
});

describe('referenceRuntimeBudgetSeconds', () => {
  it.each([
    [null, 14.2, 30],
    [20, 44.1, 45],
    [50, 12, 50],
    [null, 60, 60],
  ])(
    'plan runtime %s and a %s s reference run %s s',
    (plan, source, expected) => {
      expect(referenceRuntimeBudgetSeconds(plan, source)).toBe(expected);
    },
  );
});

describe('shot notes', () => {
  it('keep inside the shot limit', () => {
    const overlays = Array.from({ length: 6 }, (_, index) => ({
      text: `${index} ${'x'.repeat(190)}`,
      startSeconds: null,
      endSeconds: null,
      position: '',
      arrival: '',
    }));
    const [shot] = assembleReversedVideoPlan(
      { current: emptyPlan, model, runtimeBudgetSeconds: 30 },
      {
        ...videoAnalysis,
        shots: [
          { ...videoAnalysis.shots[0], overlays },
          videoAnalysis.shots[2],
        ],
      },
    ).shots;
    expect(shot.notes?.length).toBe(1_000);
  });
});

describe('assembleReversedImagePlan', () => {
  it('fills the shell a seed image leaves and adds the image as a style reference', () => {
    const plan = assembleReversedImagePlan(
      {
        current: {
          ...emptyPlan,
          runtimeBudgetSeconds: 30,
          shots: [
            {
              id: 'seed',
              ordinal: 1,
              action: '',
              onScreenSpeaker: false,
              durationSeconds: null,
              stillAssetId: 'seed-image',
              stillFreshness: 'stale',
              transition: 'cut',
            },
          ],
        },
        model,
      },
      'reference-image',
      imageAnalysis,
    );
    expect(plan.styleLabel).toBe('Warm studio, soft grain');
    expect(plan.styleReferenceAssetIds).toEqual(['reference-image']);
    expect(plan.shots).toHaveLength(1);
    expect(plan.shots[0]).toMatchObject({
      id: 'seed',
      ordinal: 1,
      action: imageAnalysis.prompt,
      durationSeconds: 4,
      stillAssetId: 'seed-image',
      notes:
        'Composition: Subject on the left third, shallow depth, eye-level.\nOn-screen text: "NEW", top right\nNeeds: environment Rooftop',
    });
  });

  it('adds one shot after the written ones', () => {
    const plan = assembleReversedImagePlan(
      {
        current: {
          ...emptyPlan,
          runtimeBudgetSeconds: 30,
          shots: [
            {
              id: 'first',
              ordinal: 1,
              action: 'Mia checks the clock.',
              onScreenSpeaker: false,
              durationSeconds: 6,
              stillFreshness: 'missing',
              transition: 'cut',
            },
          ],
        },
        model,
      },
      'reference-image',
      imageAnalysis,
    );
    expect(
      plan.shots.map(({ id, ordinal, durationSeconds }) => ({
        id,
        ordinal,
        durationSeconds,
      })),
    ).toEqual([
      { id: 'first', ordinal: 1, durationSeconds: 6 },
      { id: plan.shots[1].id, ordinal: 2, durationSeconds: 4 },
    ]);
    expect(plan.shots[1].action).toBe(imageAnalysis.prompt);
  });

  it('refuses a shot the runtime has no room for', () => {
    expect(() =>
      assembleReversedImagePlan(
        {
          current: {
            ...emptyPlan,
            runtimeBudgetSeconds: 10,
            shots: [
              {
                id: 'first',
                ordinal: 1,
                action: 'Mia checks the clock.',
                onScreenSpeaker: false,
                durationSeconds: 8,
                stillFreshness: 'missing',
                transition: 'cut',
              },
            ],
          },
          model,
        },
        'reference-image',
        imageAnalysis,
      ),
    ).toThrow(ConflictException);
  });
});
