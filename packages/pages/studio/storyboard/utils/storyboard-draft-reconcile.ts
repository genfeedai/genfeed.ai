import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardSourceSelector } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import type {
  StoryboardDraftConflict,
  StoryboardDraftFieldMerge,
  StoryboardDraftValue,
} from '@genfeedai/props/studio/storyboard.props';

export function editableStoryboard(
  value: StoryboardDraftValue,
): StoryboardDraftValue {
  return {
    source: value.source,
    plan: {
      ...value.plan,
      shots: value.plan.shots.map(({ stillFreshness: _ignored, ...shot }) => ({
        ...shot,
        stillFreshness: 'missing' as const,
      })),
    },
  };
}
export function storyboardValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => storyboardValuesEqual(value, right[index]))
    );
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => storyboardValuesEqual(a[key], b[key]));
  }
  return false;
}

const fieldLabels: Record<string, string> = {
  title: 'Title',
  logline: 'Logline',
  videoModelKey: 'Video model',
  format: 'Format',
  runtimeBudgetSeconds: 'Runtime budget',
  styleLabel: 'Style',
  styleReferenceAssetIds: 'Style references',
  cast: 'Cast',
  shots: 'Shots',
  name: 'Name',
  voiceId: 'Voice',
  avatarAssetId: 'Avatar image',
  referenceAssetIds: 'Reference images',
  sectionLabel: 'Section',
  action: 'Action',
  dialogue: 'Dialogue',
  speakerId: 'Speaker',
  onScreenSpeaker: 'On-screen speaker',
  durationSeconds: 'Duration',
  notes: 'Notes',
  stillAssetId: 'Still image',
  transition: 'Transition',
  kind: 'Source type',
  brief: 'Brief',
  seedImageAssetId: 'Starting image',
  assetId: 'Uploaded video',
  platform: 'Platform',
  credentialId: 'Connected account',
  adAccountId: 'Ad account',
  adId: 'Ad',
};
/** Arrays are atomic; cast/shot leaves merge by opaque ID only with unchanged membership/order. */
export function reconcileStoryboardDraft(
  baseValue: StoryboardDraftValue,
  localValue: StoryboardDraftValue,
  remoteValue: StoryboardDraftValue,
  choices: Record<string, 'local' | 'remote'> = {},
) {
  const base = editableStoryboard(baseValue);
  const local = editableStoryboard(localValue);
  const remote = editableStoryboard(remoteValue);
  const conflicts: StoryboardDraftConflict[] = [];
  function merge(
    base: unknown,
    local: unknown,
    remote: unknown,
    path: string,
    label: string,
  ): StoryboardDraftFieldMerge {
    // A remote-only or converged unit is resolved: rebase both display and lineage,
    // so a later remote change/revert cannot become a fabricated user edit.
    if (storyboardValuesEqual(local, base))
      return { value: remote, base: remote };
    if (storyboardValuesEqual(remote, base)) return { value: local, base };
    if (storyboardValuesEqual(local, remote))
      return { value: local, base: remote };
    if (path === 'plan.shots' || path === 'plan.cast') {
      const a = base as { id: string }[];
      const b = local as { id: string }[];
      const c = remote as { id: string }[];
      if (
        storyboardValuesEqual(
          a.map((entry) => entry.id),
          b.map((entry) => entry.id),
        ) &&
        storyboardValuesEqual(
          a.map((entry) => entry.id),
          c.map((entry) => entry.id),
        )
      ) {
        const entries = b.map((entry, index) =>
          merge(
            a[index],
            entry,
            c[index],
            `${path}.${entry.id}`,
            path === 'plan.shots'
              ? `Shot ${index + 1}`
              : `Cast member ${index + 1}`,
          ),
        );
        return {
          value: entries.map((entry) => entry.value),
          base: entries.map((entry) => entry.base),
        };
      }
    } else if (
      (path !== 'source' ||
        (base &&
          local &&
          remote &&
          (base as StoryboardSourceSelector).kind ===
            (local as StoryboardSourceSelector).kind &&
          (base as StoryboardSourceSelector).kind ===
            (remote as StoryboardSourceSelector).kind)) &&
      base &&
      local &&
      remote &&
      typeof base === 'object' &&
      typeof local === 'object' &&
      typeof remote === 'object' &&
      !Array.isArray(base) &&
      !Array.isArray(local) &&
      !Array.isArray(remote)
    ) {
      const a = base as Record<string, unknown>;
      const b = local as Record<string, unknown>;
      const c = remote as Record<string, unknown>;
      const merged: Record<string, unknown> = {};
      const rebased: Record<string, unknown> = {};
      for (const key of new Set([
        ...Object.keys(a),
        ...Object.keys(b),
        ...Object.keys(c),
      ])) {
        const value = merge(
          a[key],
          b[key],
          c[key],
          `${path}.${key}`,
          `${label}: ${fieldLabels[key] ?? key}`,
        );
        if (value.value !== undefined) merged[key] = value.value;
        if (value.base !== undefined) rebased[key] = value.base;
      }
      return { value: merged, base: rebased };
    }
    conflicts.push({ path, label, local, remote });
    return { value: choices[path] === 'remote' ? remote : local, base };
  }
  const planResult = merge(base.plan, local.plan, remote.plan, 'plan', 'Plan');
  const sourceResult = merge(
    base.source,
    local.source,
    remote.source,
    'source',
    'Source',
  );
  // Freshness belongs to the newly fetched server, never a conflict choice or an old local plan.
  const hydrate = (plan: StoryboardPlan): StoryboardPlan => ({
    ...plan,
    shots: plan.shots.map((shot) => ({
      ...shot,
      stillFreshness:
        remoteValue.plan.shots.find(
          (saved) =>
            saved.id === shot.id && saved.stillAssetId === shot.stillAssetId,
        )?.stillFreshness ?? 'missing',
    })),
  });
  return {
    value: {
      plan: hydrate(planResult.value as StoryboardPlan),
      source: sourceResult.value as StoryboardSourceSelector,
    },
    base: {
      plan: hydrate(planResult.base as StoryboardPlan),
      source: sourceResult.base as StoryboardSourceSelector,
    },
    conflicts,
  };
}
