import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    ariaLabel,
    children,
    disabled,
    onClick,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

describe('PromptBarSuggestions', () => {
  const suggestions = [
    { id: 'one', label: 'Create a plan', prompt: 'Create a plan for this' },
    {
      description: 'Switch into planning before coding',
      id: 'two',
      label: 'Use plan mode',
      prompt: 'Use plan mode for this task',
    },
    { id: 'three', label: 'Review', prompt: 'Review these changes' },
    { id: 'four', label: 'Summarize', prompt: 'Summarize this thread' },
  ];

  it('renders up to the maximum number of suggestions', () => {
    render(
      <PromptBarSuggestions
        suggestions={suggestions}
        onSuggestionSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Create a plan' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use plan mode' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Review' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Summarize' }),
    ).not.toBeInTheDocument();
  });

  it('passes the full suggestion item to the select handler', () => {
    const handleSelect = vi.fn();

    render(
      <PromptBarSuggestions
        suggestions={suggestions}
        onSuggestionSelect={handleSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use plan mode' }));

    expect(handleSelect).toHaveBeenCalledWith(suggestions[1]);
  });

  it('supports keyboard focus because suggestions are rendered as buttons', () => {
    render(
      <PromptBarSuggestions
        suggestions={suggestions}
        onSuggestionSelect={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Create a plan' });
    button.focus();

    expect(button).toHaveFocus();
  });
});
