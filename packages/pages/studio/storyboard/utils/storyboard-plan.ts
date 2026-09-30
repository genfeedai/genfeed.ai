import type {
  StoryboardPlan,
  StoryboardShot,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { getStoryboardAssetLabel } from '@pages/studio/storyboard/utils/storyboard-asset-label';

/** The server repeats these checks; this keeps invalid edits out of the save queue. */
export function storyboardApprovalProblems(plan: StoryboardPlan): string[] {
  const problems: string[] = [];
  if (plan.shots.length < 2) problems.push('Add at least two shots.');
  if (plan.runtimeBudgetSeconds === null)
    problems.push('Choose a runtime budget.');
  for (const shot of plan.shots) {
    if (shot.stillFreshness !== 'fresh' || !shot.stillAssetId)
      problems.push(`Shot ${shot.ordinal}: ${shot.stillFreshness} still.`);
    if (shot.durationSeconds === null)
      problems.push(`Shot ${shot.ordinal}: choose a supported duration.`);
    if (!shot.action.trim())
      problems.push(`Shot ${shot.ordinal}: add an action.`);
    if (shot.dialogue?.trim()) {
      const speaker = plan.cast.find((member) => member.id === shot.speakerId);
      if (!speaker?.voiceId)
        problems.push(`Shot ${shot.ordinal}: assign a speaker with a voice.`);
    }
  }
  return problems;
}

export function editStoryboardShot(
  plan: StoryboardPlan,
  id: string,
  patch: Partial<StoryboardShot>,
): StoryboardPlan {
  return {
    ...plan,
    shots: plan.shots.map((shot) => {
      if (shot.id !== id) return shot;
      const next = { ...shot, ...patch, id: shot.id, ordinal: shot.ordinal };
      if (
        patch.action !== undefined &&
        patch.action !== shot.action &&
        shot.stillAssetId
      )
        next.stillFreshness = 'stale';
      return next;
    }),
  };
}

export function editStoryboardStyle(
  plan: StoryboardPlan,
  patch: Pick<Partial<StoryboardPlan>, 'styleLabel' | 'styleReferenceAssetIds'>,
): StoryboardPlan {
  const next = { ...plan, ...patch };
  const changed =
    next.styleLabel !== plan.styleLabel ||
    JSON.stringify(next.styleReferenceAssetIds) !==
      JSON.stringify(plan.styleReferenceAssetIds);
  return {
    ...next,
    shots: changed
      ? plan.shots.map((shot) => ({
          ...shot,
          stillFreshness: shot.stillAssetId ? 'stale' : shot.stillFreshness,
        }))
      : plan.shots,
  };
}

export function reorderStoryboardShots(
  plan: StoryboardPlan,
  id: string,
  offset: -1 | 1,
): StoryboardPlan {
  const index = plan.shots.findIndex((shot) => shot.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= plan.shots.length) return plan;
  const shots = [...plan.shots];
  [shots[index], shots[target]] = [shots[target], shots[index]];
  return {
    ...plan,
    shots: shots.map((shot, position) => ({
      ...shot,
      ordinal: position + 1,
      transition:
        position === shots.length - 1 && shot.transition === 'interpolate'
          ? 'cut'
          : shot.transition,
    })),
  };
}

export function removeStoryboardShot(
  plan: StoryboardPlan,
  id: string,
): StoryboardPlan {
  const shots = plan.shots.filter((shot) => shot.id !== id);
  return {
    ...plan,
    shots: shots.map((shot, index) => ({
      ...shot,
      ordinal: index + 1,
      transition:
        index === shots.length - 1 && shot.transition === 'interpolate'
          ? 'cut'
          : shot.transition,
    })),
  };
}

export function storyboardAssetLabel(
  asset: IIngredient | undefined,
  fallback: string,
): string {
  return getStoryboardAssetLabel(asset) ?? fallback;
}
