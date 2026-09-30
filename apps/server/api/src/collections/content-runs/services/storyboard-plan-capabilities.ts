import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import { HttpException, HttpStatus } from '@nestjs/common';

export function storyboardCapabilityError(
  code: string,
  status: HttpStatus,
  affectedShotIds: string[] = [],
): never {
  const error = new HttpException(
    { title: code, code, affectedShotIds },
    status,
  );
  error.message = code;
  throw error;
}

export function isStoryboardDeletion(
  previous: StoryboardPlan,
  next: StoryboardPlan,
): boolean {
  return (
    next.shots.length < previous.shots.length &&
    JSON.stringify(
      previous.shots
        .filter((old) => next.shots.some((shot) => shot.id === old.id))
        .map((shot) => shot.id),
    ) === JSON.stringify(next.shots.map((shot) => shot.id)) &&
    next.shots.every((shot) =>
      previous.shots.some((old) => old.id === shot.id),
    ) &&
    previous.format === next.format &&
    previous.videoModelKey === next.videoModelKey &&
    previous.runtimeBudgetSeconds === next.runtimeBudgetSeconds &&
    next.shots.every((shot) => {
      const old = previous.shots.find((value) => value.id === shot.id);
      return (
        old?.durationSeconds === shot.durationSeconds &&
        (old.transition === shot.transition ||
          (shot === next.shots.at(-1) &&
            old.transition === 'interpolate' &&
            shot.transition === 'cut'))
      );
    })
  );
}

export function requiresStoryboardCapabilities(
  previous: StoryboardPlan,
  next: StoryboardPlan,
): boolean {
  if (isStoryboardDeletion(previous, next)) return false;
  return (
    previous.videoModelKey !== next.videoModelKey ||
    previous.format !== next.format ||
    previous.runtimeBudgetSeconds !== next.runtimeBudgetSeconds ||
    JSON.stringify(
      previous.shots.map((shot) => [
        shot.id,
        shot.durationSeconds,
        shot.transition,
      ]),
    ) !==
      JSON.stringify(
        next.shots.map((shot) => [
          shot.id,
          shot.durationSeconds,
          shot.transition,
        ]),
      )
  );
}

export function normalizeStoryboardTiming(
  previous: StoryboardPlan,
  next: StoryboardPlan,
  capabilities: StoryboardRunCapabilities,
  suppliedVersion: string | undefined,
  force = false,
): StoryboardPlan {
  const mutation = force || requiresStoryboardCapabilities(previous, next);
  const deletion = isStoryboardDeletion(previous, next);
  if (mutation && !suppliedVersion)
    storyboardCapabilityError(
      'STORYBOARD_CAPABILITIES_REQUIRED',
      HttpStatus.BAD_REQUEST,
    );
  if (suppliedVersion && suppliedVersion !== capabilities.capabilityVersion)
    storyboardCapabilityError(
      'STORYBOARD_CAPABILITIES_CHANGED',
      HttpStatus.CONFLICT,
    );
  if (
    mutation &&
    (capabilities.status !== 'available' || !capabilities.effectiveModel)
  )
    storyboardCapabilityError(
      capabilities.reasonCode ?? 'MODEL_CAPABILITIES_UNAVAILABLE',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  const model = capabilities.effectiveModel;
  const previousIds = new Set(previous.shots.map((shot) => shot.id));
  const shots = next.shots.map((shot, index) => {
    let durationSeconds = shot.durationSeconds;
    if (mutation && model) {
      if (!previousIds.has(shot.id))
        durationSeconds = model.supportedDurationsSeconds[0];
      else if (durationSeconds !== null)
        durationSeconds = model.supportedDurationsSeconds.reduce(
          (nearest, value) =>
            Math.abs(value - (durationSeconds ?? 0)) <
            Math.abs(nearest - (durationSeconds ?? 0))
              ? value
              : nearest,
        );
    }
    return {
      ...shot,
      ordinal: index + 1,
      durationSeconds,
      transition:
        deletion &&
        index === next.shots.length - 1 &&
        shot.transition === 'interpolate'
          ? ('cut' as const)
          : shot.transition,
    };
  });
  const total = shots.reduce(
    (sum, shot) => sum + (shot.durationSeconds ?? 0),
    0,
  );
  if (next.runtimeBudgetSeconds !== null && total > next.runtimeBudgetSeconds)
    storyboardCapabilityError(
      'STORYBOARD_RUNTIME_EXCEEDED',
      HttpStatus.UNPROCESSABLE_ENTITY,
      shots.map((shot) => shot.id),
    );
  if (mutation && model) {
    const invalid = shots.filter(
      (shot, index) =>
        shot.transition === 'interpolate' &&
        (index === shots.length - 1 || !model.hasInterpolation),
    );
    if (invalid.length)
      storyboardCapabilityError(
        invalid.some((shot) => shot.id === shots.at(-1)?.id)
          ? 'STORYBOARD_INTERPOLATION_TARGET_MISSING'
          : 'STORYBOARD_INTERPOLATION_UNSUPPORTED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        invalid.map((shot) => shot.id),
      );
    const stale = shots.filter(
      (shot, index) =>
        shot.transition === 'interpolate' &&
        (previous.shots.find((old) => old.id === shot.id)?.stillFreshness !==
          'fresh' ||
          previous.shots.find((old) => old.id === shots[index + 1]?.id)
            ?.stillFreshness !== 'fresh'),
    );
    if (stale.length)
      storyboardCapabilityError(
        'STORYBOARD_INTERPOLATION_UNSUPPORTED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        stale.map((shot) => shot.id),
      );
  }
  return { ...next, shots };
}
