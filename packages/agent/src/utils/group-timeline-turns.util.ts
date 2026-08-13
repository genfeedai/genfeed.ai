import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';

export type TimelineTurnGroup = {
  id: string;
  items: { entry: TimelineEntry; index: number }[];
};

/**
 * Cursor-style turns: each user message opens a turn that owns everything
 * until the next user message. User prompts are `position: sticky` against
 * the conversation scrollport — do not put `contain: layout` on this wrapper.
 */
export function groupTimelineTurns(
  timeline: readonly TimelineEntry[],
): TimelineTurnGroup[] {
  const turns: TimelineTurnGroup[] = [];

  timeline.forEach((entry, index) => {
    if (entry.kind === 'user-message' || turns.length === 0) {
      turns.push({ id: entry.id, items: [] });
    }
    turns[turns.length - 1]?.items.push({ entry, index });
  });

  return turns;
}
