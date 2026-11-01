import {
  approveStoryboardPlan,
  assertStoryboardSlideshowComplete,
  editStoryboardPlan,
  normalizeStoryboardSlideshow,
  snapStoryboardDurations,
  storyboardShotPrompt,
} from '@api/collections/content-runs/services/storyboard-plan-state';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { describe, expect, it } from 'vitest';

function fixture(): StoryboardNativeRunConfig {
  return {
    origin: 'native',
    contract: 'storyboard-run',
    version: 1,
    revision: 1,
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    state: 'storyboard',
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'Show a product' },
      capturedAt: '2026-09-30T12:00:00.000Z',
    },
    plan: {
      title: 'Product',
      logline: '',
      videoModelKey: null,
      format: '9:16',
      runtimeBudgetSeconds: 10,
      styleReferenceAssetIds: [],
      cast: [
        {
          id: 'cast-1',
          name: 'Host',
          voiceId: 'voice-1',
          referenceAssetIds: [],
        },
      ],
      shots: [1, 2].map((ordinal) => ({
        id: `shot-${ordinal}`,
        ordinal,
        action: `Action ${ordinal}`,
        dialogue: 'Hello',
        speakerId: 'cast-1',
        onScreenSpeaker: false,
        durationSeconds: 5,
        stillAssetId: `image-${ordinal}`,
        stillFreshness: 'fresh' as const,
        transition: 'cut' as const,
      })),
    },
  };
}
describe('Storyboard persisted edit and approval', () => {
  it('keeps a generating still generating while the creator keeps editing', () => {
    const config = fixture();
    config.plan.shots[0] = {
      ...config.plan.shots[0],
      stillAssetId: undefined,
      stillFreshness: 'generating',
    };
    config.plan.shots[1].stillFreshness = 'generating';
    const plan = structuredClone(config.plan);
    plan.shots[0].action = 'Edited while rendering';
    plan.shots[1].notes = 'A note';
    plan.shots[0].stillFreshness = 'missing';
    const next = editStoryboardPlan(config, plan);
    expect(next.plan.shots.map((shot) => shot.stillFreshness)).toEqual([
      'generating',
      'generating',
    ]);
  });
  it('keeps a failed still failed until its inputs change', () => {
    const config = fixture();
    config.plan.shots[0] = {
      ...config.plan.shots[0],
      stillAssetId: undefined,
      stillFreshness: 'failed',
    };
    const plan = structuredClone(config.plan);
    plan.shots[0].notes = 'Not a still input';
    expect(editStoryboardPlan(config, plan).plan.shots[0].stillFreshness).toBe(
      'failed',
    );
    plan.shots[0].action = 'A new action';
    expect(editStoryboardPlan(config, plan).plan.shots[0].stillFreshness).toBe(
      'missing',
    );
  });
  it('stales a still when its sketch format changes', () => {
    const config = fixture();
    const plan = structuredClone(config.plan);
    plan.format = '16:9';
    expect(
      editStoryboardPlan(config, plan).plan.shots.map(
        (shot) => shot.stillFreshness,
      ),
    ).toEqual(['stale', 'stale']);
  });
  it('clears approval and quote while staling only the changed shot', () => {
    const config = fixture();
    config.approvedRevision = 1;
    const plan = structuredClone(config.plan);
    plan.shots[0].action = 'New action';
    const next = editStoryboardPlan(config, plan);
    expect(next.revision).toBe(2);
    expect(next.approvedRevision).toBeUndefined();
    expect(next.plan.shots.map((shot) => shot.stillFreshness)).toEqual([
      'stale',
      'fresh',
    ]);
    expect(config.plan.shots[0].action).toBe('Action 1');
  });
  it('never accepts client-supplied asset IDs or freshness for a new shot', () => {
    const config = fixture();
    const plan = structuredClone(config.plan);
    plan.shots[0].stillAssetId = 'foreign-image';
    plan.shots[0].stillFreshness = 'fresh';
    expect(editStoryboardPlan(config, plan).plan.shots[0].stillAssetId).toBe(
      'image-1',
    );
    plan.runtimeBudgetSeconds = 15;
    plan.shots.push({ ...plan.shots[0], id: 'new', ordinal: 3 });
    expect(editStoryboardPlan(config, plan).plan.shots[2]).toMatchObject({
      stillFreshness: 'missing',
      stillAssetId: undefined,
    });
  });
  it('style changes stale all existing stills; voice changes keep images and clear approval', () => {
    const config = approveStoryboardPlan(fixture());
    const plan = structuredClone(config.plan);
    plan.styleLabel = 'Painterly';
    expect(
      editStoryboardPlan(config, plan).plan.shots.every(
        (shot) => shot.stillFreshness === 'stale',
      ),
    ).toBe(true);
    const voices = structuredClone(config.plan);
    voices.cast[0].voiceId = 'voice-2';
    const recast = editStoryboardPlan(config, voices);
    expect(recast.approvedRevision).toBeUndefined();
    expect(recast.plan.shots[0].stillFreshness).toBe('fresh');
    expect(storyboardShotPrompt(recast.plan, 'shot-1').voiceId).toBe('voice-2');
  });
  it('snaps nearest supported duration with lower ties and rejects an over-budget result', () => {
    const plan = fixture().plan;
    expect(
      snapStoryboardDurations(plan, [6, 4]).shots.map(
        (shot) => shot.durationSeconds,
      ),
    ).toEqual([4, 4]);
    expect(() => snapStoryboardDurations(plan, [8])).toThrow(
      'Shorten another shot',
    );
    expect(() => snapStoryboardDurations(plan, [])).toThrow(
      'supported duration',
    );
  });
  it('blocks incomplete plans, stale stills, and unvoiced dialogue', () => {
    const config = fixture();
    config.plan.runtimeBudgetSeconds = null;
    expect(() => approveStoryboardPlan(config)).toThrow('runtime');
    config.plan.runtimeBudgetSeconds = 10;
    config.plan.shots[0].stillFreshness = 'stale';
    expect(() => approveStoryboardPlan(config)).toThrow('shots 1');
    config.plan.shots[0].stillFreshness = 'fresh';
    config.plan.cast[0].voiceId = undefined;
    expect(() => approveStoryboardPlan(config)).toThrow('shots 1, 2');
  });
  it('excludes notes and sections from prompts and defaults to voiceover', () => {
    const plan = fixture().plan;
    plan.shots[0].notes = 'PRIVATE';
    plan.shots[0].sectionLabel = 'Opening';
    const prompt = storyboardShotPrompt(plan, 'shot-1');
    expect(JSON.stringify(prompt)).not.toContain('PRIVATE');
    expect(prompt).not.toHaveProperty('sectionLabel');
    expect(prompt.dialogueMode).toBe('voiceover');
    plan.cast[0].avatarAssetId = 'avatar-1';
    plan.shots[0].onScreenSpeaker = true;
    expect(storyboardShotPrompt(plan, 'shot-1').dialogueMode).toBe('lip_sync');
  });
});

describe('Shot cast image-conditioning freshness', () => {
  it('stales A-to-B reference changes and rejects approval while retaining an unaffected shot', () => {
    const config = fixture();
    config.plan.cast[0].referenceAssetIds = ['portrait-A'];
    config.plan.cast.push({
      id: 'cast-2',
      name: 'Guest',
      voiceId: 'voice-2',
      referenceAssetIds: ['portrait-B'],
    });
    const submitted = structuredClone(config.plan);
    submitted.shots[0].speakerId = 'cast-2';
    const next = editStoryboardPlan(config, submitted);
    expect(next.plan.shots[0].stillFreshness).toBe('stale');
    expect(next.plan.shots[1].stillFreshness).toBe('fresh');
    expect(() => approveStoryboardPlan(next)).toThrow();
  });
  it('stales a null-to-cast image reference change', () => {
    const config = fixture();
    delete config.plan.shots[0].speakerId;
    config.plan.cast[0].referenceAssetIds = ['portrait-A'];
    const submitted = structuredClone(config.plan);
    submitted.shots[0].speakerId = 'cast-1';
    expect(
      editStoryboardPlan(config, submitted).plan.shots[0].stillFreshness,
    ).toBe('stale');
  });
  it('preserves freshness for different speakers with the same effective image references', () => {
    const config = fixture();
    config.plan.cast[0].referenceAssetIds = ['portrait-shared'];
    config.plan.cast.push({
      id: 'cast-2',
      name: 'Guest',
      voiceId: 'voice-2',
      referenceAssetIds: ['portrait-shared'],
    });
    const submitted = structuredClone(config.plan);
    submitted.shots[0].speakerId = 'cast-2';
    expect(
      editStoryboardPlan(config, submitted).plan.shots[0].stillFreshness,
    ).toBe('fresh');
  });
  it('preserves voice-only changes but stales changed image conditioning for the same speaker', () => {
    const config = fixture();
    const voiceOnly = structuredClone(config.plan);
    voiceOnly.cast[0].voiceId = 'voice-2';
    expect(
      editStoryboardPlan(config, voiceOnly).plan.shots[0].stillFreshness,
    ).toBe('fresh');
    const imageChange = structuredClone(config.plan);
    imageChange.cast[0].referenceAssetIds = ['portrait-B'];
    expect(
      editStoryboardPlan(config, imageChange).plan.shots[0].stillFreshness,
    ).toBe('stale');
  });
});

function slideshowPlan(
  overrides: Partial<StoryboardPlan> = {},
): StoryboardPlan {
  return {
    kind: 'slideshow',
    title: 'Five habits',
    logline: 'Swipe for five habits.',
    videoModelKey: null,
    format: '4:5',
    runtimeBudgetSeconds: null,
    styleReferenceAssetIds: [],
    cast: [],
    shots: [1, 2, 3].map((ordinal) => ({
      id: `slide-${ordinal}`,
      ordinal,
      action: `Habit ${ordinal}`,
      onScreenSpeaker: false,
      durationSeconds: null,
      stillAssetId: `image-${ordinal}`,
      stillFreshness: 'fresh' as const,
      transition: 'cut' as const,
    })),
    ...overrides,
  };
}

describe('Storyboard slideshow plans', () => {
  it.each([
    ['one slide', 1],
    ['thirteen slides', 13],
  ])('refuses %s', (_label, count) => {
    const base = slideshowPlan();
    const plan = {
      ...base,
      shots: Array.from({ length: count }, (_, index) => ({
        ...base.shots[0],
        id: `slide-${index + 1}`,
        ordinal: index + 1,
      })),
    };

    expect(() => assertStoryboardSlideshowComplete(plan)).toThrow(
      'A slideshow needs 2–12 slides.',
    );
  });

  it('names the slides still missing a fresh image', () => {
    const base = slideshowPlan();
    const plan = slideshowPlan({
      shots: [
        base.shots[0],
        { ...base.shots[1], stillFreshness: 'stale' },
        { ...base.shots[2], stillAssetId: undefined },
      ],
    });

    expect(() => assertStoryboardSlideshowComplete(plan)).toThrow(
      'Described slides with fresh images are required for slides 2, 3.',
    );
  });

  it('accepts a described slideshow with a fresh image on every slide', () => {
    expect(() =>
      assertStoryboardSlideshowComplete(slideshowPlan()),
    ).not.toThrow();
  });

  it('strips video-only fields when a slideshow is edited', () => {
    const base = slideshowPlan();
    const normalized = normalizeStoryboardSlideshow({
      ...base,
      runtimeBudgetSeconds: 30,
      shots: base.shots.map((shot) => ({
        ...shot,
        dialogue: 'Hi',
        durationSeconds: 5,
        transition: 'stitch' as const,
      })),
    });

    expect(normalized).toMatchObject({
      kind: 'slideshow',
      runtimeBudgetSeconds: null,
      shots: [
        { durationSeconds: null, transition: 'cut' },
        { durationSeconds: null, transition: 'cut' },
        { durationSeconds: null, transition: 'cut' },
      ],
    });
    expect(normalized.shots[0].dialogue).toBeUndefined();
  });

  it('approves a complete slideshow at the current revision and refuses one with pending slides', () => {
    const complete = { ...fixture(), plan: slideshowPlan() };
    const pending = {
      ...fixture(),
      plan: slideshowPlan({
        shots: slideshowPlan().shots.map((shot, index) =>
          index === 0 ? { ...shot, stillFreshness: 'missing' as const } : shot,
        ),
      }),
    };

    expect(approveStoryboardPlan(complete)).toMatchObject({
      approvedRevision: 1,
      state: 'approved',
    });
    expect(() => approveStoryboardPlan(pending)).toThrow(
      'Described slides with fresh images are required for slides 1.',
    );
  });
});
