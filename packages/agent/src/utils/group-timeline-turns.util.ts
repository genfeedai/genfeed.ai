import { AgentWorkEventStatus } from '@genfeedai/agent/models/agent-chat.model';
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

/**
 * How long the turn worked: the longest run recorded in it, or the span from
 * its first entry to its last when no run reports a duration.
 */
export function getTurnWorkDurationMs(turn: TimelineTurnGroup): number | null {
  const candidates: number[] = [];
  const times: number[] = [];

  for (const { entry } of turn.items) {
    if (entry.kind === 'work-group' && entry.totalDurationMs != null) {
      candidates.push(entry.totalDurationMs);
    }
    const time = Date.parse(entry.createdAt);
    if (Number.isFinite(time)) {
      times.push(time);
    }
  }
  if (times.length > 1) {
    candidates.push(Math.max(...times) - Math.min(...times));
  }

  return candidates.length > 0 ? Math.max(...candidates) : null;
}

/** Keep final copy and every structured result/action outside the activity fold. */
export function splitCompletedTimelineTurn(turn: TimelineTurnGroup): {
  activity: TimelineTurnGroup['items'];
  visible: TimelineTurnGroup['items'];
} {
  const finalAssistant = [...turn.items]
    .reverse()
    .find(({ entry }) => entry.kind === 'assistant-message');
  const terminal = turn.items.at(-1)?.entry;
  const hasTerminalFailure =
    terminal?.kind === 'work-group' &&
    [AgentWorkEventStatus.FAILED, AgentWorkEventStatus.CANCELLED].includes(
      terminal.events.at(-1)?.status ?? AgentWorkEventStatus.COMPLETED,
    );
  if (!finalAssistant || hasTerminalFailure)
    return { activity: [], visible: turn.items };
  const activity: TimelineTurnGroup['items'] = [];
  const visible: TimelineTurnGroup['items'] = [];
  for (const item of turn.items) {
    const { entry } = item;
    if (
      entry.kind === 'user-message' ||
      item === finalAssistant ||
      (entry.kind === 'assistant-message' &&
        ((entry.message.metadata?.uiActions?.length ?? 0) > 0 ||
          Boolean(entry.message.metadata?.proposedPlan) ||
          Boolean(entry.message.metadata?.generatedContent) ||
          Boolean(entry.message.metadata?.agentTransfer?.transfer)))
    ) {
      visible.push(item);
    } else {
      activity.push(item);
    }
  }
  return { activity, visible };
}
