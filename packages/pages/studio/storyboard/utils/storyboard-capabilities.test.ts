import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardVideoModelCapability } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import { describe, expect, it } from 'vitest';
import {
  normalizeStoryboardModel,
  requiresStoryboardTimingCapabilities,
} from './storyboard-capabilities';

const model: StoryboardVideoModelCapability = {
  key: 'video',
  label: 'Video',
  provider: 'fixture',
  supportedDurationsSeconds: [4, 6],
  defaultDurationSeconds: null,
  hasInterpolation: false,
  supportedFormats: ['9:16'],
  capabilitySource: 'catalog',
};
const plan: StoryboardPlan = {
  title: 'Plan',
  logline: '',
  format: '9:16',
  videoModelKey: null,
  runtimeBudgetSeconds: 12,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [1, 2, 3].map((ordinal) => ({
    id: `shot-${ordinal}`,
    ordinal,
    action: 'Scene',
    durationSeconds: 5,
    stillFreshness: 'fresh',
    stillAssetId: `still-${ordinal}`,
    onScreenSpeaker: false,
    transition: 'cut',
  })),
};
describe('model timing changes', () => {
  it('snaps every shot atomically and resolves ties downward', () => {
    expect(
      normalizeStoryboardModel(plan, model).shots.map(
        (shot) => shot.durationSeconds,
      ),
    ).toEqual([4, 4, 4]);
  });
  it('rejects a model switch exceeding the total budget without mutating the draft', () => {
    expect(() =>
      normalizeStoryboardModel({ ...plan, runtimeBudgetSeconds: 10 }, model),
    ).toThrow('runtime budget');
    expect(plan.shots[0].durationSeconds).toBe(5);
  });
  it('rejects unsupported interpolation and preserves null draft timing', () => {
    expect(() =>
      normalizeStoryboardModel(
        {
          ...plan,
          shots: [
            { ...plan.shots[0], transition: 'interpolate' },
            plan.shots[1],
          ],
        },
        model,
      ),
    ).toThrow('interpolation');
    expect(
      normalizeStoryboardModel(
        { ...plan, shots: [{ ...plan.shots[0], durationSeconds: null }] },
        model,
      ).shots[0].durationSeconds,
    ).toBeNull();
  });
  it('allows deletion and text edits without capabilities but protects reorder, timing and models', () => {
    expect(
      requiresStoryboardTimingCapabilities(plan, { ...plan, title: 'Edited' }),
    ).toBe(false);
    expect(
      requiresStoryboardTimingCapabilities(plan, {
        ...plan,
        shots: plan.shots.slice(0, 2),
      }),
    ).toBe(false);
    expect(
      requiresStoryboardTimingCapabilities(plan, {
        ...plan,
        shots: [plan.shots[1], plan.shots[0], plan.shots[2]],
      }),
    ).toBe(true);
    expect(
      requiresStoryboardTimingCapabilities(plan, {
        ...plan,
        videoModelKey: model.key,
      }),
    ).toBe(true);
  });
});
