import type { AgentWorkEvent } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it, vi } from 'vitest';
import { selectActiveWorkEvent } from './AgentChatContainerThreadView';

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    usePromptModal: () => ({ openPromptModal: vi.fn() }),
  }),
);

function makeWorkEvent(
  overrides: Partial<AgentWorkEvent> = {},
): AgentWorkEvent {
  return {
    createdAt: '2026-08-19T00:00:00.000Z',
    event: AgentWorkEventType.STARTED,
    id: 'event-1',
    label: 'Working',
    status: AgentWorkEventStatus.PENDING,
    threadId: 'thread-1',
    ...overrides,
  };
}

describe('selectActiveWorkEvent', () => {
  it('returns the latest pending or running event', () => {
    const selected = selectActiveWorkEvent([
      makeWorkEvent({
        id: 'older-running',
        status: AgentWorkEventStatus.RUNNING,
      }),
      makeWorkEvent({
        id: 'latest-pending',
        status: AgentWorkEventStatus.PENDING,
      }),
      makeWorkEvent({
        id: 'done',
        status: AgentWorkEventStatus.COMPLETED,
      }),
    ]);

    expect(selected?.id).toBe('latest-pending');
  });

  it('prefers a tool event over a lifecycle bookend', () => {
    const selected = selectActiveWorkEvent([
      makeWorkEvent({
        id: 'lifecycle',
        status: AgentWorkEventStatus.RUNNING,
      }),
      makeWorkEvent({
        id: 'tool',
        status: AgentWorkEventStatus.PENDING,
        toolCallId: 'call-1',
        toolName: 'generate_image',
      }),
    ]);

    expect(selected?.id).toBe('tool');
  });

  it('returns null when the stream is no longer active', () => {
    expect(
      selectActiveWorkEvent(
        [
          makeWorkEvent({
            id: 'stuck',
            status: AgentWorkEventStatus.RUNNING,
            toolName: 'generate_image',
          }),
        ],
        { isStreamActive: false },
      ),
    ).toBeNull();
  });

  it('ignores completed, failed, and cancelled events', () => {
    expect(
      selectActiveWorkEvent([
        makeWorkEvent({
          id: 'completed',
          status: AgentWorkEventStatus.COMPLETED,
          toolName: 'generate_image',
        }),
        makeWorkEvent({
          id: 'failed',
          status: AgentWorkEventStatus.FAILED,
          toolName: 'generate_image',
        }),
        makeWorkEvent({
          id: 'cancelled',
          status: AgentWorkEventStatus.CANCELLED,
          toolName: 'generate_image',
        }),
      ]),
    ).toBeNull();
  });
});
