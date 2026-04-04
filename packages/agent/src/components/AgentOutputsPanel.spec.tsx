import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const seedComposer = vi.fn();

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeThreadId: 'thread-1',
      messages: [
        {
          content: 'assistant',
          createdAt: '2026-03-20T10:00:00.000Z',
          id: 'message-1',
          metadata: {
            uiActions: [
              {
                id: 'action-1',
                images: ['https://cdn.test/output-1.png'],
                title: 'Launch variants',
                tweets: ['Variant A copy'],
                type: 'content_preview_card',
              },
            ],
          },
          role: 'assistant',
          threadId: 'thread-1',
        },
      ],
      seedComposer,
    }),
}));

describe('AgentOutputsPanel', () => {
  it('renders grouped outputs and can seed the composer from the selected output', () => {
    render(<AgentOutputsPanel />);

    expect(
      screen.getByRole('heading', { name: 'Launch variants' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('2 variants')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Use in chat' }));

    expect(seedComposer).toHaveBeenCalledTimes(1);
    expect(seedComposer).toHaveBeenCalledWith(
      'Use this output in the current thread:\nLaunch variants\nhttps://cdn.test/output-1.png',
      'thread-1',
    );
  });
});
