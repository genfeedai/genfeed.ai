import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type {
  EnrichedWorkEvent,
  TimelineAssistantMessage,
  TimelineEntry,
  TimelineUserMessage,
  TimelineWorkGroup,
} from '@genfeedai/agent/utils/derive-timeline';
import { describe, expect, it } from 'vitest';
import {
  computeStableTimelineEntries,
  EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
} from './compute-stable-timeline-entries';

function msg(overrides: Partial<AgentChatMessage> = {}): AgentChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as AgentChatMessage;
}

function userEntry(
  overrides: Partial<TimelineUserMessage> = {},
): TimelineUserMessage {
  return {
    kind: 'user-message',
    id: 'user-1',
    message: msg(),
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function assistantEntry(
  overrides: Partial<TimelineAssistantMessage> = {},
): TimelineAssistantMessage {
  return {
    kind: 'assistant-message',
    id: 'assistant-1',
    message: msg({ id: 'msg-2', role: 'assistant', content: 'hi there' }),
    createdAt: '2026-01-01T00:00:01.000Z',
    ...overrides,
  };
}

function workEvent(
  overrides: Partial<EnrichedWorkEvent> = {},
): EnrichedWorkEvent {
  return {
    id: 'event-1',
    event: AgentWorkEventType.TOOL_COMPLETED,
    label: 'Tool',
    status: AgentWorkEventStatus.COMPLETED,
    createdAt: '2026-01-01T00:00:00.500Z',
    threadId: 't1',
    ...overrides,
  } as EnrichedWorkEvent;
}

function workGroupEntry(
  overrides: Partial<TimelineWorkGroup> = {},
): TimelineWorkGroup {
  return {
    kind: 'work-group',
    id: 'work-1',
    events: [workEvent()],
    createdAt: '2026-01-01T00:00:00.500Z',
    presentation: 'archived',
    totalDurationMs: 500,
    ...overrides,
  };
}

describe('computeStableTimelineEntries', () => {
  it('returns the empty state unchanged when given no entries', () => {
    const state = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [],
    );

    expect(state.result).toEqual([]);
  });

  it('reuses prior entry references when content is unchanged', () => {
    const first = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [userEntry(), assistantEntry()],
    );

    // Simulate a re-derivation that rebuilds every object from scratch but
    // with identical content (this is what `deriveHistoricalTimeline` does
    // on every `messages`/`workEvents` change).
    const rebuilt: TimelineEntry[] = [userEntry(), assistantEntry()];
    const second = computeStableTimelineEntries(first, rebuilt);

    expect(second.result[0]).toBe(first.result[0]);
    expect(second.result[1]).toBe(first.result[1]);
    // Rebuilt objects are not the same reference as the input.
    expect(second.result[0]).not.toBe(rebuilt[0]);
  });

  it('returns the exact same state object when nothing changed', () => {
    const first = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [userEntry(), assistantEntry()],
    );
    const second = computeStableTimelineEntries(first, [
      userEntry(),
      assistantEntry(),
    ]);

    expect(second).toBe(first);
  });

  it('replaces only the entry whose content changed', () => {
    const first = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [userEntry(), assistantEntry()],
    );

    const changedAssistant = assistantEntry({
      message: msg({ id: 'msg-2', role: 'assistant', content: 'edited' }),
    });
    const second = computeStableTimelineEntries(first, [
      userEntry(),
      changedAssistant,
    ]);

    expect(second.result[0]).toBe(first.result[0]);
    expect(second.result[1]).toBe(changedAssistant);
    expect(second.result[1]).not.toBe(first.result[1]);
  });

  it('reuses work-group entries when the underlying events are deep-equal', () => {
    const first = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [workGroupEntry()],
    );

    const rebuiltGroup = workGroupEntry();
    const second = computeStableTimelineEntries(first, [rebuiltGroup]);

    expect(second.result[0]).toBe(first.result[0]);
  });

  it('detects a changed work-group when its events differ', () => {
    const first = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [workGroupEntry()],
    );

    const changedGroup = workGroupEntry({
      events: [workEvent({ status: AgentWorkEventStatus.FAILED })],
    });
    const second = computeStableTimelineEntries(first, [changedGroup]);

    expect(second.result[0]).toBe(changedGroup);
    expect(second.result[0]).not.toBe(first.result[0]);
  });

  it('appends new entries while keeping stable references for existing ones', () => {
    const first = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [userEntry()],
    );

    const second = computeStableTimelineEntries(first, [
      userEntry(),
      assistantEntry(),
    ]);

    expect(second.result).toHaveLength(2);
    expect(second.result[0]).toBe(first.result[0]);
    expect(second.result[1]).toEqual(assistantEntry());
  });

  it('drops entries that are no longer present', () => {
    const first = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [userEntry(), assistantEntry()],
    );

    const second = computeStableTimelineEntries(first, [userEntry()]);

    expect(second.result).toHaveLength(1);
    expect(second.result[0]).toBe(first.result[0]);
  });

  it('treats a changed kind for the same id as a change', () => {
    const first = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [userEntry({ id: 'shared-id' })],
    );

    const nextAsAssistant = assistantEntry({ id: 'shared-id' });
    const second = computeStableTimelineEntries(first, [nextAsAssistant]);

    expect(second.result[0]).toBe(nextAsAssistant);
  });

  it('reorders without losing reference stability per id', () => {
    const first = computeStableTimelineEntries(
      EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
      [userEntry(), assistantEntry()],
    );

    const second = computeStableTimelineEntries(first, [
      assistantEntry(),
      userEntry(),
    ]);

    expect(second.result[0]).toBe(first.result[1]);
    expect(second.result[1]).toBe(first.result[0]);
  });
});
