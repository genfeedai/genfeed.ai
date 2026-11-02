import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@ui/primitives/tooltip';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { describe, expect, it, vi } from 'vitest';

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

  it('shows the description on a chip and the prompt on a card, trimmed', async () => {
    const user = userEvent.setup();
    const prompt = `Plan today's X posts. ${'Keep each one short. '.repeat(12)}`;
    const suggestion = {
      description: 'One post per hour',
      id: 'schedule',
      label: "Schedule today's tweets",
      prompt,
    };
    const { unmount } = render(
      <TooltipProvider delayDuration={0}>
        <PromptBarSuggestions
          suggestions={[suggestion]}
          onSuggestionSelect={vi.fn()}
        />
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole('button', { name: suggestion.label }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'One post per hour',
    );
    unmount();

    render(
      <TooltipProvider delayDuration={0}>
        <PromptBarSuggestions
          suggestions={[suggestion]}
          onSuggestionSelect={vi.fn()}
          variant="cards"
        />
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole('button', { name: suggestion.label }));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent("Plan today's X posts. Keep each one");
    expect(tooltip).toHaveTextContent('…');
    expect(tooltip.textContent?.length).toBeLessThan(prompt.length);
  });

  it.each([
    ['repeats its label', { label: 'Plan David', prompt: ' plan  david ' }],
    [
      'has a description the card already shows',
      { description: 'Warm track', label: 'Soundtrack', prompt: 'warm track' },
    ],
  ])('shows no tooltip when the only extra text %s', async (_name, fields) => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <PromptBarSuggestions
          suggestions={[{ id: 'plain', ...fields }]}
          onSuggestionSelect={vi.fn()}
          variant="cards"
        />
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole('button', { name: fields.label }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders card tiles when variant is cards', () => {
    render(
      <PromptBarSuggestions
        suggestions={suggestions}
        onSuggestionSelect={vi.fn()}
        variant="cards"
      />,
    );

    const button = screen.getByRole('button', { name: 'Create a plan' });
    expect(button.className).toContain('rounded-2xl');
    expect(button.className).toContain('flex-col');
  });
});
