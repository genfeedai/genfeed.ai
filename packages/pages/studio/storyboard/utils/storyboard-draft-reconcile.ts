import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardSourceSelector } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import type {
  StoryboardDraftConflict,
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
  ): unknown {
    if (storyboardValuesEqual(local, base)) return remote;
    if (
      storyboardValuesEqual(remote, base) ||
      storyboardValuesEqual(local, remote)
    )
      return local;
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
        return b.map((entry, index) =>
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
          `${label}: ${key}`,
        );
        if (value !== undefined) merged[key] = value;
      }
      return merged;
    }
    conflicts.push({ path, label, local, remote });
    return choices[path] === 'remote' ? remote : local;
  }
  const plan = merge(
    base.plan,
    local.plan,
    remote.plan,
    'plan',
    'Plan',
  ) as StoryboardPlan;
  // Freshness belongs to the newly fetched server, never a conflict choice or an old local plan.
  plan.shots = plan.shots.map((shot) => ({
    ...shot,
    stillFreshness:
      remoteValue.plan.shots.find(
        (saved) =>
          saved.id === shot.id && saved.stillAssetId === shot.stillAssetId,
      )?.stillFreshness ?? 'missing',
  }));
  const source = merge(
    base.source,
    local.source,
    remote.source,
    'source',
    'Source',
  ) as StoryboardSourceSelector;
  return { value: { plan, source }, conflicts };
}
