import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';

export interface StableTimelineEntriesState {
  byId: Map<string, TimelineEntry>;
  result: TimelineEntry[];
}

export const EMPTY_STABLE_TIMELINE_ENTRIES_STATE: StableTimelineEntriesState = {
  byId: new Map(),
  result: [],
};

/**
 * Structurally shares historical timeline entries across re-derivations.
 *
 * `deriveHistoricalTimeline` rebuilds every entry (and every nested message /
 * work-event object it copies) on each call, so a naive `messages` /
 * `workEvents` change invalidates the whole array by reference even when
 * only one entry actually changed. Row components memoized with
 * `React.memo` still re-render on every entry in that case because their
 * `entry` prop is a fresh object.
 *
 * This diffs the next entries against the previous ones by `id` and reuses
 * the prior object reference whenever the content is deep-equal, so
 * `React.memo` can bail out on everything that did not change. Adapted from
 * the "stable rows" pattern in pingdotgg/t3code's `MessagesTimeline.logic.ts`
 * — reimplemented here without an `effect`-based equality helper, since this
 * repo does not depend on `effect`.
 */
export function computeStableTimelineEntries(
  previous: StableTimelineEntriesState,
  nextEntries: TimelineEntry[],
): StableTimelineEntriesState {
  const nextById = new Map<string, TimelineEntry>();
  let hasAnyChange = nextEntries.length !== previous.byId.size;

  const result = nextEntries.map((entry, index) => {
    const previousEntry = previous.byId.get(entry.id);
    const stableEntry =
      previousEntry && isTimelineEntryUnchanged(previousEntry, entry)
        ? previousEntry
        : entry;
    nextById.set(entry.id, stableEntry);
    if (!hasAnyChange && previous.result[index] !== stableEntry) {
      hasAnyChange = true;
    }
    return stableEntry;
  });

  return hasAnyChange ? { byId: nextById, result } : previous;
}

function isTimelineEntryUnchanged(
  previous: TimelineEntry,
  next: TimelineEntry,
): boolean {
  if (previous.kind !== next.kind || previous.id !== next.id) {
    return false;
  }

  switch (previous.kind) {
    case 'user-message':
    case 'assistant-message': {
      const nextTyped = next as typeof previous;
      return (
        previous.message === nextTyped.message &&
        previous.createdAt === nextTyped.createdAt
      );
    }
    case 'work-group': {
      const nextTyped = next as typeof previous;
      return (
        previous.createdAt === nextTyped.createdAt &&
        previous.presentation === nextTyped.presentation &&
        previous.totalDurationMs === nextTyped.totalDurationMs &&
        deepEqual(previous.events, nextTyped.events)
      );
    }
    case 'streaming': {
      // The live row is composed separately (see `composeTimelineWithStream`)
      // and is never a member of the historical entries this helper diffs —
      // fall back to a full deep-equal for safety if it ever is.
      return deepEqual(previous, next);
    }
    default:
      return false;
  }
}

/**
 * Small recursive value equality scoped to plain JSON-shaped data
 * (the `TimelineEntry` payloads: messages, work events, primitives). Not a
 * general-purpose deep-equal — does not handle `Date`, `Map`, `Set`, or
 * cyclic structures, none of which appear in these payloads.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== typeof b || a === null || b === null) {
    return false;
  }

  if (typeof a !== 'object') {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => deepEqual(aRecord[key], bRecord[key]));
}
