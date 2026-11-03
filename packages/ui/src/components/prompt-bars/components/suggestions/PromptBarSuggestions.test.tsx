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

  it('shows a thumbnail on a card tile and drops its icon', () => {
    const { container } = render(
      <PromptBarSuggestions
        onSuggestionSelect={vi.fn()}
        suggestions={[
          {
            description: 'A short reel',
            icon: <svg data-testid="tile-icon" />,
            id: 'reel',
            label: 'Reel',
            prompt: 'Make a reel',
            thumbnailUrl: '/starters/turbo/videoShorts.webp',
          },
          {
            icon: <svg data-testid="tile-icon" />,
            id: 'plain',
            label: 'Plain',
            prompt: 'Make something',
          },
        ]}
        variant="cards"
      />,
    );

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('src')).toContain('videoShorts.webp');
    // Only the tile without a thumbnail keeps its icon.
    expect(screen.getAllByTestId('tile-icon')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Reel' })).toHaveTextContent(
      'A short reel',
    );
  });

  it('falls back to the icon when a thumbnail fails to load', () => {
    const { container } = render(
      <PromptBarSuggestions
        onSuggestionSelect={vi.fn()}
        suggestions={[
          {
            icon: <svg data-testid="tile-icon" />,
            id: 'reel',
            label: 'Reel',
            prompt: 'Make a reel',
            thumbnailUrl: '/starters/turbo/videoShorts.webp',
          },
        ]}
        variant="cards"
      />,
    );

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getByTestId('tile-icon')).toBeInTheDocument();
  });

  it('ignores a thumbnail in the chip variant', () => {
    const { container } = render(
      <PromptBarSuggestions
        onSuggestionSelect={vi.fn()}
        suggestions={[
          {
            id: 'reel',
            label: 'Reel',
            prompt: 'Make a reel',
            thumbnailUrl: '/starters/turbo/videoShorts.webp',
          },
        ]}
      />,
    );

    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('marks only the active suggestion as pressed', () => {
    render(
      <PromptBarSuggestions
        activeId="two"
        onSuggestionSelect={vi.fn()}
        suggestions={suggestions}
        variant="cards"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Use plan mode' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Review' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Use plan mode' })).toHaveClass(
      'ring-2',
      'ring-primary',
    );
    expect(screen.getByRole('button', { name: 'Review' })).not.toHaveClass(
      'ring-primary',
    );
  });

  it('leaves aria-pressed off when no active suggestion is tracked', () => {
    render(
      <PromptBarSuggestions
        onSuggestionSelect={vi.fn()}
        suggestions={suggestions}
      />,
    );

    expect(screen.getByRole('button', { name: 'Review' })).not.toHaveAttribute(
      'aria-pressed',
    );
  });
});
