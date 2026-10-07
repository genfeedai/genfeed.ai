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

/** Keep final copy and every structured result/action outside the activity fold. */
export function splitCompletedTimelineTurn(turn: TimelineTurnGroup): {
  activity: TimelineTurnGroup['items'];
  visible: TimelineTurnGroup['items'];
} {
  const finalAssistant = turn.items.findLast(
    ({ entry }) => entry.kind === 'assistant-message',
  );
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
