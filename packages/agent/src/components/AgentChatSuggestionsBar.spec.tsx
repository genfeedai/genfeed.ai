import { AgentChatSuggestionsBar } from '@genfeedai/agent/components/AgentChatSuggestionsBar';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/prompt-bars/components/suggestions/PromptBarSuggestions', () => ({
  default: ({ className }: { className?: string; children?: ReactNode }) => (
    <div className={className} role="toolbar" aria-label="Prompt suggestions" />
  ),
}));

const suggestedActions = [
  { label: 'Generate posts', prompt: 'Generate posts for this week' },
  { label: 'Review content', prompt: 'Review pending content' },
  { label: 'Check analytics', prompt: 'Check this week’s analytics' },
];

describe('AgentChatSuggestionsBar', () => {
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
      '[&>button]:border-0',
      '[&>button]:bg-transparent',
      '[&>button]:shadow-none',
    );
  });
});
