import '@agent-tests/media-preview-mocks';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    credentials: [],
    selectedBrand: { id: 'brand-1', organizationId: 'org-1', label: 'Genfeed' },
  }),
}));

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

  it('renders grouped outputs and seeds a refine reference for the selected output', () => {
    render(<AgentOutputsPanel />);

    expect(
      screen.getByRole('heading', { name: 'Launch variants' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 variants')).toBeInTheDocument();
    expect(screen.getByText('image · 2 variants')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refine' }));

    expect(seedComposer).toHaveBeenCalledTimes(1);
    expect(seedComposer).toHaveBeenCalledWith(
      'Refine Launch variants (https://cdn.test/output-1.png): ',
      'thread-1',
    );
  });

  it('opens the selected image output in an expanded viewer', () => {
    render(<AgentOutputsPanel />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Launch variants',
      }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-url',
      'https://cdn.test/output-1.png',
    );
  });

  it('renders every segment of a generated thread and refines it by its hook', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Refine' }));

    expect(seedComposer).toHaveBeenCalledWith(
      'Refine the Launch thread ("Hook"): ',
      'thread-1',
    );
  });

  it('truncates a long text output to a one-line excerpt', () => {
    const longPost = `Most AI content tools are toys.\n\nWe built an OS. ${'Friday. '.repeat(20)}`;
    messages = [
      {
        content: 'assistant',
        createdAt: '2026-10-03T10:00:00.000Z',
        id: 'message-post',
        metadata: {
          uiActions: [
            {
              contentFormat: 'social_post',
              id: 'post-output',
              platform: 'twitter',
              textContent: longPost,
              title: 'X post',
              type: 'content_preview_card',
            },
          ],
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];

    render(<AgentOutputsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Refine' }));

    const seeded = seedComposer.mock.calls[0]?.[0] as string;
    expect(
      seeded.startsWith(
        'Refine the X post ("Most AI content tools are toys. We built an OS.',
      ),
    ).toBe(true);
    expect(seeded).toContain('…"): ');
    expect(seeded).not.toContain('\n');
  });
});
