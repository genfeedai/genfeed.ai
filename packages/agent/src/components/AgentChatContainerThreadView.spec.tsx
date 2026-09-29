import { selectActiveWorkEvent } from '@genfeedai/agent/components/AgentChatContainerThreadView';
import type { AgentWorkEvent } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    usePromptModal: () => ({ openPromptModal: vi.fn() }),
  }),
);

vi.mock('@genfeedai/agent/components/AgentChatTimeline', () => ({
  AgentChatTimeline: () => <div>timeline</div>,
}));

vi.mock('@genfeedai/agent/components/AgentWorkObjects', () => ({
  AgentWorkObjects: () => null,
}));

vi.mock('@genfeedai/agent/components/AgentPlanReviewSection', () => ({
  AgentPlanReviewSection: () => null,
}));

vi.mock('@genfeedai/agent/components/AgentInputRequestOverlay', () => ({
  AgentInputRequestOverlay: () => null,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: function MockPrimitiveButton(props: {
    ariaLabel?: string;
    onClick?: () => void;
    children?: ReactNode;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

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
});
