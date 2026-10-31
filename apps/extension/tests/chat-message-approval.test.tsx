import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '~components/chat/ChatMessage';
import type { ChatMessage as ChatMessageModel } from '~models/chat.model';

vi.mock('~components/chat/ContentPreview', () => ({
  ContentPreview: ({ message }: { message: ChatMessageModel }) => (
    <p>reply: {message.content}</p>
  ),
}));

const message: ChatMessageModel = {
  content: 'I drafted a plan and paused for your approval.',
  createdAt: '2026-10-30T09:55:00Z',
  id: 'assistant-1',
  metadata: {
    proposedPlan: {
      content: 'Quote the 25 ads, then ask for a go.',
      steps: [{ status: 'pending', step: 'Quote the credit cost' }],
    },
    reviewRequired: true,
  },
  role: 'assistant',
  threadId: 'thread-1',
};

afterEach(cleanup);

describe('a paused assistant message', () => {
  it('says it is waiting for approval and shows the plan', () => {
    render(<ChatMessage message={message} />);

    expect(screen.getByRole('alert').textContent).toContain(
      'Waiting for your approval',
    );
    expect(screen.getByText('Quote the credit cost')).toBeTruthy();
    expect(screen.queryByText(/^reply:/)).toBeNull();
  });

  it('sends the user to Genfeed to approve', () => {
    render(<ChatMessage message={message} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Genfeed' }));

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: expect.stringContaining('genfeed'),
    });
  });

  it('shows an ordinary answer as a reply', () => {
    render(
      <ChatMessage
        message={{ ...message, content: 'Here is a reply.', metadata: {} }}
      />,
    );

    expect(screen.getByText('reply: Here is a reply.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
