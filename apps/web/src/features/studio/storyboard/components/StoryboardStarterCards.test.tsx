import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardStarterCards from './StoryboardStarterCards';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function renderCards(
  props: Partial<ComponentProps<typeof StoryboardStarterCards>> = {},
) {
  return render(
    <StoryboardStarterCards
      isDisabled={false}
      isSlideshow={false}
      onSelect={vi.fn()}
      {...props}
    />,
  );
}

describe('storyboard starter cards', () => {
  it('offers three video pitches', () => {
    renderCards();
    expect(screen.getByText('Product teaser')).toBeInTheDocument();
    expect(screen.getByText('Founder story')).toBeInTheDocument();
    expect(screen.getByText('Quick how-to')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('offers three slideshow pitches on a slideshow', () => {
    renderCards({ isSlideshow: true });
    expect(screen.getByText('Tips carousel')).toBeInTheDocument();
    expect(screen.getByText('Before and after')).toBeInTheDocument();
    expect(screen.getByText('Myth busting')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('hands the full prompt to the host when a card is picked', () => {
    const onSelect = vi.fn();
    renderCards({ onSelect });
    fireEvent.click(screen.getByTestId('storyboard-starter-founderStory'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.stringContaining('A 30-second founder story'),
    );
  });

  it('does not react while the composer is unavailable', () => {
    const onSelect = vi.fn();
    renderCards({ isDisabled: true, onSelect });
    fireEvent.click(screen.getByTestId('storyboard-starter-howTo'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
