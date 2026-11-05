import { AgentChatSuggestionsBar } from '@genfeedai/agent/components/AgentChatSuggestionsBar';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/prompt-bars/components/suggestions/PromptBarSuggestions', () => ({
  default: ({
    className,
    variant,
  }: {
    className?: string;
    children?: ReactNode;
    variant?: string;
  }) => (
    <div
      className={className}
      data-variant={variant}
      role="toolbar"
      aria-label="Prompt suggestions"
    />
  ),
}));

const suggestedActions = [
  { label: 'Generate posts', prompt: 'Generate posts for this week' },
  { label: 'Review content', prompt: 'Review pending content' },
  { label: 'Check analytics', prompt: 'Check this week’s analytics' },
];

describe('AgentChatSuggestionsBar', () => {
  it('renders dock suggestions as squared shared cards with icons and sends the full prompt', () => {
    const onSend = vi.fn();
    render(
      <AgentChatSuggestionsBar
        isReadOnly={false}
        layout="dock"
        onSend={onSend}
        suggestedActions={[
          {
            label: 'Review selection',
            prompt: 'Review all selected records in detail',
            description: 'Get a second opinion',
          },
        ]}
      />,
    );

    const suggestions = screen.getByRole('toolbar', {
      name: 'Prompt suggestions',
    });
    expect(suggestions).toHaveClass('grid-cols-3');
    const action = screen.getByRole('button', { name: 'Review selection' });
    expect(action).toHaveClass('rounded-card');
    expect(action.querySelector('.lucide-bot-message-square')).not.toBeNull();
    expect(screen.getByText('Get a second opinion')).toBeInTheDocument();
    fireEvent.click(action);
    expect(onSend).toHaveBeenCalledWith(
      'Review all selected records in detail',
    );
  });

  it('disables dock cards for a read-only conversation', () => {
    const onSend = vi.fn();
    render(
      <AgentChatSuggestionsBar
        isReadOnly
        layout="dock"
        onSend={onSend}
        suggestedActions={suggestedActions}
      />,
    );
    const action = screen.getByRole('button', { name: 'Generate posts' });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows new-conversation actions as one row of three equal tiles once the pane is wide enough', () => {
    render(
      <AgentChatSuggestionsBar
        isReadOnly={false}
        layout="equal"
        onSend={vi.fn()}
        suggestedActions={suggestedActions}
      />,
    );

    expect(
      screen.getByRole('toolbar', { name: 'Prompt suggestions' }),
    ).toHaveAttribute('data-variant', 'cards');
    expect(
      screen.getByRole('toolbar', { name: 'Prompt suggestions' }),
    ).toHaveClass(
      'grid',
      'grid-cols-1',
      'sm:grid-cols-1',
      '@lg:grid-cols-3',
      '[&>button]:w-full',
      '[&>button]:max-w-none',
    );
  });

  it('keeps new-conversation actions in one row of three tiles, however many are passed', () => {
    render(
      <AgentChatSuggestionsBar
        isReadOnly={false}
        layout="equal"
        onSend={vi.fn()}
        suggestedActions={[
          ...suggestedActions,
          { label: 'About this page', prompt: 'Explain this page' },
        ]}
      />,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Prompt suggestions' });
    expect(toolbar).toHaveClass('@lg:grid-cols-3');
    expect(toolbar).not.toHaveClass('@3xl:grid-cols-4');
    expect(toolbar.parentElement).toHaveClass('@container');
  });

  it('shows only three dock suggestions', () => {
    render(
      <AgentChatSuggestionsBar
        isReadOnly={false}
        layout="dock"
        onSend={vi.fn()}
        suggestedActions={[
          ...suggestedActions,
          { label: 'About this page', prompt: 'Explain this page' },
        ]}
      />,
    );

    expect(
      within(
        screen.getByRole('toolbar', { name: 'Prompt suggestions' }),
      ).getAllByRole('button'),
    ).toHaveLength(3);
  });
});
