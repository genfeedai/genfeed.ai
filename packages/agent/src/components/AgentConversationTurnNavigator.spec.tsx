import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentConversationTurnNavigator } from './AgentConversationTurnNavigator';

function buildMessage(
  id: string,
  role: 'assistant' | 'user',
  content: string,
): TimelineEntry {
  return {
    createdAt: '2026-08-09T12:00:00.000Z',
    id,
    kind: role === 'user' ? 'user-message' : 'assistant-message',
    message: {
      content,
      createdAt: '2026-08-09T12:00:00.000Z',
      id,
      role,
      threadId: 'thread-1',
    },
  } as TimelineEntry;
}

function createConversationDom(turnIds: string[]) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    value: 1_000,
  });
  container.getBoundingClientRect = vi.fn(() => ({
    bottom: 1_000,
    height: 1_000,
    left: 0,
    right: 800,
    toJSON: () => ({}),
    top: 0,
    width: 800,
    x: 0,
    y: 0,
  })) as never;

  const anchors = turnIds.map((turnId) => {
    const anchor = document.createElement('div');
    anchor.id = `agent-message-${turnId}`;
    anchor.scrollIntoView = vi.fn();
    container.append(anchor);
    return anchor;
  });
  document.body.append(container);

  return {
    anchors,
    container,
    ref: { current: container } as RefObject<HTMLDivElement | null>,
  };
}

afterEach(() => {
  document.querySelectorAll('[id^="agent-message-"]').forEach((element) => {
    element.parentElement?.remove();
  });
});

describe('AgentConversationTurnNavigator', () => {
  it('renders one prompt marker per user message', () => {
    const conversation = createConversationDom(['user-1', 'user-2']);

    render(
      <AgentConversationTurnNavigator
        scrollContainerRef={conversation.ref}
        timeline={[
          buildMessage('user-1', 'user', 'Plan the launch'),
          buildMessage('assistant-1', 'assistant', 'Here is the plan'),
          buildMessage('user-2', 'user', 'Now draft the announcement'),
        ]}
      />,
    );

    expect(
      screen.getByRole('navigation', { name: 'Conversation prompts' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Prompt 1: Plan the launch' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Prompt 2: Now draft the announcement',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('clusters markers tightly instead of spreading them down the column', () => {
    const conversation = createConversationDom(['user-1', 'user-2', 'user-3']);

    const { container } = render(
      <AgentConversationTurnNavigator
        scrollContainerRef={conversation.ref}
        timeline={[
          buildMessage('user-1', 'user', 'First'),
          buildMessage('user-2', 'user', 'Second'),
          buildMessage('user-3', 'user', 'Third'),
        ]}
      />,
    );

    const rail = container.querySelector(
      'nav[aria-label="Conversation prompts"] > div',
    );
    expect(rail?.className).toMatch(/gap-0\.5/);
    expect(rail?.className).toMatch(/justify-center/);
    expect(rail?.className).not.toMatch(/justify-between/);
  });

  it('jumps to the selected user prompt', () => {
    const conversation = createConversationDom(['user-1', 'user-2']);

    render(
      <AgentConversationTurnNavigator
        scrollContainerRef={conversation.ref}
        timeline={[
          buildMessage('user-1', 'user', 'First prompt'),
          buildMessage('user-2', 'user', 'Second prompt'),
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Prompt 1: First prompt' }),
    );

    expect(conversation.anchors[0]?.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(
      screen.getByRole('button', { name: 'Prompt 1: First prompt' }),
    ).toHaveAttribute('aria-current', 'location');
  });

  it('tracks the user prompt nearest the viewport activation line', async () => {
    const conversation = createConversationDom(['user-1', 'user-2']);
    const firstRect = vi.fn(() => ({ top: -100 }));
    const secondRect = vi.fn(() => ({ top: 500 }));
    const [firstAnchor, secondAnchor] = conversation.anchors;
    if (!firstAnchor || !secondAnchor) {
      throw new Error('Expected two conversation anchors.');
    }
    firstAnchor.getBoundingClientRect = firstRect as never;
    secondAnchor.getBoundingClientRect = secondRect as never;

    render(
      <AgentConversationTurnNavigator
        scrollContainerRef={conversation.ref}
        timeline={[
          buildMessage('user-1', 'user', 'First prompt'),
          buildMessage('user-2', 'user', 'Second prompt'),
        ]}
      />,
    );

    fireEvent.scroll(conversation.container);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Prompt 1: First prompt' }),
      ).toHaveAttribute('aria-current', 'location'),
    );

    secondRect.mockReturnValue({ top: 100 });
    fireEvent.scroll(conversation.container);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Prompt 2: Second prompt' }),
      ).toHaveAttribute('aria-current', 'location'),
    );
  });
});
