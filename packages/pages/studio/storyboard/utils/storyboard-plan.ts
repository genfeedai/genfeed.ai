import type { StoryboardShot } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StoryboardEditablePlan } from '@genfeedai/props/studio/storyboard.props';
import { getStoryboardAssetLabel } from '@pages/studio/storyboard/utils/storyboard-asset-label';

/** The server repeats these checks; this keeps invalid edits out of the save queue. */
export function storyboardApprovalProblems(
  plan: StoryboardEditablePlan,
): string[] {
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

/**
 * Stills are server-owned. A local edit may stale a still before it saves,
 * but a still the server is generating, or one it attached or settled since
 * the local copy, always shows the server's state.
 */
export function overlayStoryboardStills(
  local: StoryboardEditablePlan,
  saved: StoryboardEditablePlan | null | undefined,
): StoryboardEditablePlan {
  if (!saved) return local;
  const byId = new Map(saved.shots.map((shot) => [shot.id, shot]));
  return {
    ...local,
    shots: local.shots.map((shot) => {
      const server = byId.get(shot.id);
      if (
        !server ||
        (server.stillFreshness !== 'generating' &&
          shot.stillFreshness !== 'generating' &&
          server.stillAssetId === shot.stillAssetId)
      )
        return shot;
      return {
        ...shot,
        stillAssetId: server.stillAssetId,
        stillFreshness: server.stillFreshness,
      };
    }),
  } as StoryboardEditablePlan;
}

/** Described shots whose still is missing, out of date or failed, in board order. */
export function storyboardShotsNeedingStills(
  plan: StoryboardEditablePlan,
): StoryboardShot[] {
  return plan.shots.filter(
    (shot) =>
      Boolean(shot.action.trim()) &&
      ['missing', 'stale', 'failed'].includes(shot.stillFreshness),
  );
}

export function editStoryboardShot(
  plan: StoryboardEditablePlan,
  id: string,
  patch: Partial<StoryboardShot>,
): StoryboardEditablePlan {
  return {
    ...plan,
    shots: plan.shots.map((shot) => {
      if (shot.id !== id) return shot;
      const next = { ...shot, ...patch, id: shot.id, ordinal: shot.ordinal };
      // A still being generated settles fresh or stale on the server.
      if (
        patch.action !== undefined &&
        patch.action !== shot.action &&
        shot.stillAssetId &&
        shot.stillFreshness !== 'generating'
      )
        next.stillFreshness = 'stale';
      return next;
    }),
  } as StoryboardEditablePlan;
}

export function editStoryboardStyle(
  plan: StoryboardEditablePlan,
  patch: Pick<
    Partial<StoryboardEditablePlan>,
    'styleLabel' | 'styleReferenceAssetIds'
  >,
): StoryboardEditablePlan {
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
          stillFreshness:
            shot.stillAssetId && shot.stillFreshness !== 'generating'
              ? 'stale'
              : shot.stillFreshness,
        }))
      : plan.shots,
  } as StoryboardEditablePlan;
}

export function reorderStoryboardShots(
  plan: StoryboardEditablePlan,
  id: string,
  offset: -1 | 1,
): StoryboardEditablePlan {
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
  } as StoryboardEditablePlan;
}

/** Inserts a shot at `index` and renumbers the saved order. */
export function insertStoryboardShot(
  plan: StoryboardEditablePlan,
  index: number,
  shot: Omit<StoryboardShot, 'ordinal'>,
): StoryboardEditablePlan {
  const at = Math.min(Math.max(index, 0), plan.shots.length);
  const shots = [...plan.shots];
  shots.splice(at, 0, { ...shot, ordinal: at + 1 });
  return {
    ...plan,
    shots: shots.map((current, position) => ({
      ...current,
      ordinal: position + 1,
      // The shot it interpolated into is no longer its neighbour.
      transition:
        position === at - 1 && current.transition === 'interpolate'
          ? 'cut'
          : current.transition,
    })),
  } as StoryboardEditablePlan;
}

export function removeStoryboardShot(
  plan: StoryboardEditablePlan,
  id: string,
): StoryboardEditablePlan {
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
  } as StoryboardEditablePlan;
}

export function storyboardAssetLabel(
  asset: IIngredient | undefined,
  fallback: string,
): string {
  return getStoryboardAssetLabel(asset) ?? fallback;
}
