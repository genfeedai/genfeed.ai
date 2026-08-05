import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seedComposer = vi.fn();
const defaultMessages = [
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
];
let messages = defaultMessages;

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeThreadId: 'thread-1',
      messages,
      seedComposer,
    }),
}));

describe('AgentOutputsPanel', () => {
  beforeEach(() => {
    messages = defaultMessages;
    seedComposer.mockReset();
  });

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

  it('opens the selected image output in an expanded viewer', () => {
    render(<AgentOutputsPanel />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open Launch variants preview',
      }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Image preview')).toBeInTheDocument();
  });

  it('renders and reuses every segment of a generated thread', () => {
    messages = [
      {
        content: 'assistant',
        createdAt: '2026-08-05T10:00:00.000Z',
        id: 'message-thread',
        metadata: {
          uiActions: [
            {
              contentFormat: 'thread',
              id: 'thread-output',
              platform: 'twitter',
              textContent: 'Hook',
              title: 'Launch thread',
              tweets: ['Hook', 'Proof', 'Close'],
              type: 'content_preview_card',
            },
          ],
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];

    render(<AgentOutputsPanel />);

    expect(screen.getByText('Hook')).toBeInTheDocument();
    expect(screen.getByText('Proof')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use in chat' }));

    expect(seedComposer).toHaveBeenCalledWith(
      'Hook\n\nProof\n\nClose',
      'thread-1',
    );
  });
});
