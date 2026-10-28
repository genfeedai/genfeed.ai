import type {
  AgentChatMessage,
  AgentProposedPlan,
} from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { resolvePlanAnchors } from '@genfeedai/agent/utils/resolve-plan-anchors.util';
import { describe, expect, it } from 'vitest';

function plan(
  id: string,
  overrides: Partial<AgentProposedPlan> = {},
): AgentProposedPlan {
  return {
    content: `Steps for ${id}`,
    createdAt: '2026-10-28T07:00:00.000Z',
    id,
    status: 'awaiting_approval',
    updatedAt: '2026-10-28T07:00:00.000Z',
    ...overrides,
  };
}

function assistant(
  id: string,
  proposedPlan?: AgentProposedPlan,
): TimelineEntry {
  const message: AgentChatMessage = {
    content: 'reply',
    createdAt: '2026-10-28T07:00:00.000Z',
    id,
    metadata: proposedPlan ? { proposedPlan } : undefined,
    role: 'assistant',
    threadId: 'thread-1',
  };
  return {
    createdAt: message.createdAt,
    id,
    kind: 'assistant-message',
    message,
  };
}

describe('resolvePlanAnchors', () => {
  it('shows a plan under the message that proposed it', () => {
    const proposed = plan('plan-1');
    const anchors = resolvePlanAnchors(
      [assistant('m-1', proposed), assistant('m-2')],
      proposed,
    );

    expect([...anchors.byMessageId.keys()]).toEqual(['m-1']);
    expect(anchors.trailing).toBeNull();
  });

  it('shows an approved plan once, at its first message, with its current status', () => {
    const proposed = plan('plan-1');
    const approved = plan('plan-1', { status: 'approved' });
    const anchors = resolvePlanAnchors(
      [assistant('m-1', proposed), assistant('m-2', approved)],
      approved,
    );

    expect([...anchors.byMessageId.keys()]).toEqual(['m-1']);
    expect(anchors.byMessageId.get('m-1')?.status).toBe('approved');
  });

  it('marks a replaced plan superseded', () => {
    const first = plan('plan-1');
    const revised = plan('plan-2');
    const anchors = resolvePlanAnchors(
      [assistant('m-1', first), assistant('m-2', revised)],
      revised,
    );

    expect(anchors.byMessageId.get('m-1')?.status).toBe('superseded');
    expect(anchors.byMessageId.get('m-2')?.status).toBe('awaiting_approval');
  });

  it('closes the timeline with a plan no message carries', () => {
    const snapshotPlan = plan('plan-1');
    const anchors = resolvePlanAnchors([assistant('m-1')], snapshotPlan);

    expect(anchors.byMessageId.size).toBe(0);
    expect(anchors.trailing).toBe(snapshotPlan);
  });
});
