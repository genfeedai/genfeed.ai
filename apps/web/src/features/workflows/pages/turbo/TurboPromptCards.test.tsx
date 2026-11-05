import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TurboPromptCards from './TurboPromptCards';

const mocks = vi.hoisted(() => ({
  ideas: {
    isBrandApproved: true,
    isLoading: false,
    proposals: [] as unknown[],
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/features/workflows/hooks/use-turbo-brand-ideas', () => ({
  useTurboBrandIdeas: () => mocks.ideas,
}));

function idea(title: string) {
  return {
    angle: `${title}: an angle written from the brand kit.`,
    count: 6,
    formats: ['image', 'video'],
    title,
    why: 'It builds on your best performing posts.',
  };
}

describe('TurboPromptCards', () => {
  beforeEach(() => {
    mocks.ideas = { isBrandApproved: true, isLoading: false, proposals: [] };
  });

  it('shows exactly three cards, the agent ideas for the brand', () => {
    mocks.ideas = {
      isBrandApproved: true,
      isLoading: false,
      proposals: [idea('One'), idea('Two'), idea('Three'), idea('Four')],
    };
    const onSelect = vi.fn();
    render(<TurboPromptCards brandId="brand-1" onSelect={onSelect} />);

    const cards = within(screen.getByTestId('turbo-prompt-cards')).getAllByRole(
      'button',
    );
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'One',
      'Two',
      'Three',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    expect(onSelect).toHaveBeenCalledWith(idea('Two'), 'Two');
  });

  it('falls back to three brand-neutral starters without agent ideas', () => {
    render(<TurboPromptCards brandId="brand-1" onSelect={vi.fn()} />);

    const cards = within(screen.getByTestId('turbo-prompt-cards')).getAllByRole(
      'button',
    );
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Weekly content mix',
      'Short-form video burst',
      'Avatar explainers',
    ]);
  });

  it('asks for brand kit approval above the three starters when the brand has none', () => {
    mocks.ideas = { isBrandApproved: false, isLoading: false, proposals: [] };
    render(<TurboPromptCards brandId="brand-1" onSelect={vi.fn()} />);

    expect(screen.getByTestId('turbo-brand-approval')).toHaveTextContent(
      'Approve the brand kit so your agent can write starters for this brand.',
    );
    expect(
      within(screen.getByTestId('turbo-prompt-cards')).getAllByRole('button'),
    ).toHaveLength(3);
  });
});
