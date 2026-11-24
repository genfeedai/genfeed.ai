import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentThreadListLayout from '@ui/layout/agent-output-layout/AgentThreadListLayout';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const labels = { conversation: 'Conversation', threads: 'Threads' };

function Harness({ conversationKey }: { conversationKey: string | null }) {
  return (
    <AgentThreadListLayout
      conversation={<p>Transcript</p>}
      conversationHeader={<span>Thread title</span>}
      conversationKey={conversationKey}
      labels={labels}
      list={<p>Thread rows</p>}
    />
  );
}

describe('AgentThreadListLayout', () => {
  it('puts the thread list on the left and the conversation beside it', () => {
    render(<Harness conversationKey="thread-1" />);

    const list = screen.getByTestId('agent-thread-list-pane');
    const conversation = screen.getByTestId(
      'agent-thread-list-conversation-pane',
    );

    expect(
      list.compareDocumentPosition(conversation) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(list).toHaveTextContent('Thread rows');
    expect(conversation).toHaveTextContent('Thread title');
    expect(conversation).toHaveTextContent('Transcript');
  });

  it('gives the list the narrow column and the conversation the rest', () => {
    render(<Harness conversationKey="thread-1" />);

    expect(
      screen.getByTestId('agent-thread-list-pane').parentElement,
    ).toHaveClass('xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]');
  });

  it('shows the conversation first below xl once a thread is open', () => {
    render(<Harness conversationKey="thread-1" />);

    expect(screen.getByTestId('agent-thread-list-layout')).toHaveAttribute(
      'data-mobile-view',
      'conversation',
    );
    expect(screen.getByTestId('agent-thread-list-pane')).toHaveClass(
      'max-xl:hidden',
    );
  });

  it('shows the list first below xl while no thread is open', () => {
    render(<Harness conversationKey={null} />);

    expect(screen.getByTestId('agent-thread-list-layout')).toHaveAttribute(
      'data-mobile-view',
      'threads',
    );
    expect(
      screen.getByTestId('agent-thread-list-conversation-pane'),
    ).toHaveClass('max-xl:hidden');
  });

  it('brings the conversation forward again when another thread opens', async () => {
    const { rerender } = render(<Harness conversationKey="thread-1" />);
    const layout = screen.getByTestId('agent-thread-list-layout');

    await userEvent.click(
      screen.getByRole('button', { name: 'View: Conversation' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Threads' }),
    );
    expect(layout).toHaveAttribute('data-mobile-view', 'threads');

    rerender(<Harness conversationKey="thread-2" />);
    expect(layout).toHaveAttribute('data-mobile-view', 'conversation');
  });
});
