import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardVideoModelCapability } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';

type StoryboardRunPlan = NonNullable<StoryboardRun['config']['plan']>;

/** Match the API's deletion exception: unavailable models must not trap draft shots. */
export function requiresStoryboardTimingCapabilities(
  previous: StoryboardRunPlan,
  next: StoryboardRunPlan,
): boolean {
  const sameSettings =
    previous.format === next.format &&
    previous.videoModelKey === next.videoModelKey &&
    previous.runtimeBudgetSeconds === next.runtimeBudgetSeconds;
  const deletion =
    sameSettings &&
    next.shots.length < previous.shots.length &&
    JSON.stringify(
      previous.shots
        .filter((old) => next.shots.some((shot) => shot.id === old.id))
        .map((shot) => shot.id),
    ) === JSON.stringify(next.shots.map((shot) => shot.id)) &&
    next.shots.every((shot, index) => {
      const old = previous.shots.find((value) => value.id === shot.id);
      return (
        old?.durationSeconds === shot.durationSeconds &&
        (old?.transition === shot.transition ||
          (index === next.shots.length - 1 &&
            old?.transition === 'interpolate' &&
            shot.transition === 'cut'))
      );
    });
  return (
    !deletion &&
    (!sameSettings ||
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
        ))
  );
}

/** Switching models is atomic: reject the whole edit if snapped timing cannot fit. */
export function normalizeStoryboardModel(
  plan: StoryboardRunPlan,
  model: StoryboardVideoModelCapability,
): StoryboardRunPlan {
  if (!model.supportedFormats.includes(plan.format))
    throw new Error('Choose a format supported by this video model.');
  const shots = plan.shots.map((shot, index) => {
    if (
      shot.transition === 'interpolate' &&
      (!model.hasInterpolation ||
        index === plan.shots.length - 1 ||
        shot.stillFreshness !== 'fresh' ||
        plan.shots[index + 1]?.stillFreshness !== 'fresh')
    )
      throw new Error(
        'Change unsupported interpolation transitions before switching models.',
      );
    const durationSeconds =
      shot.durationSeconds === null
        ? null
        : model.supportedDurationsSeconds.reduce((nearest, value) =>
            Math.abs(value - (shot.durationSeconds ?? 0)) <
            Math.abs(nearest - (shot.durationSeconds ?? 0))
              ? value
              : nearest,
          );
    return { ...shot, durationSeconds };
  });
  if (
    plan.runtimeBudgetSeconds !== null &&
    shots.reduce((total, shot) => total + (shot.durationSeconds ?? 0), 0) >
      plan.runtimeBudgetSeconds
  )
    throw new Error(
      'This model exceeds the runtime budget. Shorten shots or increase the budget first.',
    );
  return { ...plan, shots } as StoryboardRunPlan;
}
