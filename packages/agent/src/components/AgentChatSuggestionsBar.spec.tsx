import { AgentChatSuggestionsBar } from '@genfeedai/agent/components/AgentChatSuggestionsBar';
import { render, screen } from '@testing-library/react';
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
  it('keeps descriptive dock shortcuts compact instead of using tall cards', () => {
    render(
      <AgentChatSuggestionsBar
        isReadOnly={false}
        layout="dock"
        onSend={vi.fn()}
        suggestedActions={[
          {
            label: 'Configure',
            prompt: 'Configure this page',
            description: 'Review your settings and connected accounts',
          },
        ]}
      />,
    );

    const suggestions = screen.getByRole('toolbar', {
      name: 'Prompt suggestions',
    });
    expect(suggestions).toHaveAttribute('data-variant', 'chips');
    expect(suggestions).toHaveClass('justify-start');
    expect(suggestions).not.toHaveClass('sm:grid-cols-3');
  });

  it('aligns new-conversation actions to three equal desktop columns', () => {
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
    ).toHaveClass(
      'grid',
      'grid-cols-1',
      'sm:grid-cols-3',
      '[&>button]:w-full',
      '[&>button]:max-w-none',
    );
  });
});
