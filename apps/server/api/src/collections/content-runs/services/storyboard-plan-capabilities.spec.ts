import { normalizeStoryboardTiming } from '@api/collections/content-runs/services/storyboard-plan-capabilities';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import { describe, expect, it } from 'vitest';

const version = 'a'.repeat(64);
function fixture(): StoryboardPlan {
  return {
    videoModelKey: null,
    title: '',
    logline: '',
    format: '9:16',
    runtimeBudgetSeconds: 12,
    cast: [],
    styleReferenceAssetIds: [],
    shots: [1, 2].map((ordinal) => ({
      id: `shot-${ordinal}`,
      ordinal,
      action: 'Action',
      onScreenSpeaker: false,
      durationSeconds: 5,
      stillFreshness: 'fresh' as const,
      stillAssetId: `image-${ordinal}`,
      transition: 'cut' as const,
    })),
  };
}
function capabilities(): StoryboardRunCapabilities {
  return {
    version: 1,
    runId: 'run-1',
    runRevision: 1,
    capabilityVersion: version,
    status: 'available',
    requestedModelKey: null,
    reasonCode: null,
    eligibleModels: [],
    effectiveModel: {
      key: 'custom/video',
      label: 'Custom',
      provider: 'replicate',
      supportedDurationsSeconds: [4, 6],
      defaultDurationSeconds: null,
      hasInterpolation: true,
      supportedFormats: ['9:16'],
      capabilitySource: 'catalog',
    },
  };
}
describe('Atomic capability-bound Storyboard edits', () => {
  it('requires a capability acknowledgement for timing edits and rejects stale hashes', () => {
    const old = fixture();
    const next = structuredClone(old);
    next.shots[0].durationSeconds = 6;
    expect(() =>
      normalizeStoryboardTiming(old, next, capabilities(), undefined),
    ).toThrow('STORYBOARD_CAPABILITIES_REQUIRED');
    expect(() =>
      normalizeStoryboardTiming(old, next, capabilities(), 'b'.repeat(64)),
    ).toThrow('STORYBOARD_CAPABILITIES_CHANGED');
  });
  it('snaps all shots with lower ties on model changes, preserving the prior plan', () => {
    const old = fixture();
    const next = { ...structuredClone(old), videoModelKey: 'custom/video' };
    expect(
      normalizeStoryboardTiming(old, next, capabilities(), version).shots.map(
        (shot) => shot.durationSeconds,
      ),
    ).toEqual([4, 4]);
    expect(old.shots[0].durationSeconds).toBe(5);
  });
  it('rejects over-budget snapped results atomically with affected IDs', () => {
    const old = fixture();
    const next = structuredClone(old);
    next.shots[0].durationSeconds = 6;
    next.runtimeBudgetSeconds = 7;
    try {
      normalizeStoryboardTiming(old, next, capabilities(), version);
      throw new Error('should reject');
    } catch (error) {
      expect((error as { getResponse(): unknown }).getResponse()).toMatchObject(
        {
          code: 'STORYBOARD_RUNTIME_EXCEEDED',
          affectedShotIds: ['shot-1', 'shot-2'],
        },
      );
    }
    expect(old.runtimeBudgetSeconds).toBe(12);
  });
  it('permits text and deletion when capabilities unavailable, normalizing a final interpolation to cut', () => {
    const old = fixture();
    old.shots[0].transition = 'interpolate';
    const unavailable = {
      ...capabilities(),
      status: 'unavailable' as const,
      effectiveModel: null,
      reasonCode: 'MODEL_DISABLED' as const,
    };
    const text = structuredClone(old);
    text.shots[0].notes = 'Private';
    expect(
      normalizeStoryboardTiming(old, text, unavailable, undefined).shots[0]
        .notes,
    ).toBe('Private');
    const deleted = { ...old, shots: [old.shots[0]] };
    expect(
      normalizeStoryboardTiming(old, deleted, unavailable, undefined).shots[0]
        .transition,
    ).toBe('cut');
  });
  it('blocks unsupported/final/stale interpolation without mutating the prior plan', () => {
    const old = fixture();
    const next = structuredClone(old);
    next.shots[0].transition = 'interpolate';
    const unsupported = capabilities();
    if (unsupported.effectiveModel)
      unsupported.effectiveModel.hasInterpolation = false;
    expect(() =>
      normalizeStoryboardTiming(old, next, unsupported, version),
    ).toThrow('STORYBOARD_INTERPOLATION_UNSUPPORTED');
    next.shots[1].transition = 'interpolate';
    expect(() =>
      normalizeStoryboardTiming(old, next, capabilities(), version),
    ).toThrow('STORYBOARD_INTERPOLATION_TARGET_MISSING');
    next.shots[1].transition = 'cut';
    old.shots[1].stillFreshness = 'stale';
    expect(() =>
      normalizeStoryboardTiming(old, next, capabilities(), version),
    ).toThrow('STORYBOARD_INTERPOLATION_UNSUPPORTED');
  });
  it('uses the actual model minimum for a new shot and leaves null durations as drafts', () => {
    const old = fixture();
    const next = structuredClone(old);
    next.shots[0].durationSeconds = null;
    next.shots.push({
      ...next.shots[1],
      id: 'shot-3',
      ordinal: 3,
      durationSeconds: 60,
    });
    const result = normalizeStoryboardTiming(
      old,
      next,
      capabilities(),
      version,
    );
    expect(result.shots.map((shot) => shot.durationSeconds)).toEqual([
      null,
      4,
      4,
    ]);
  });
});
