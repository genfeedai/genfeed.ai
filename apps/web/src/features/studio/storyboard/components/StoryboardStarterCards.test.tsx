import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryboardStarterCards from '@/features/studio/storyboard/components/StoryboardStarterCards';

const mocks = vi.hoisted(() => ({
  briefs: {
    isBrandApproved: true,
    isLoading: false,
    proposals: [] as unknown[],
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@/features/studio/storyboard/hooks/use-storyboard-agent-briefs',
  () => ({
    useStoryboardAgentBriefs: () => mocks.briefs,
  }),
);

function proposal(title: string) {
  return {
    brief: `${title}: a brief written from the brand kit.`,
    shots: [
      { description: 'Lab bench close-up', durationSeconds: 5 },
      { description: 'Bottle on the shelf', durationSeconds: 7 },
    ],
    title,
    why: 'Origin stories held viewers longest.',
  };
}

describe('StoryboardStarterCards', () => {
  beforeEach(() => {
    mocks.briefs = { isBrandApproved: true, isLoading: false, proposals: [] };
  });

  it('shows exactly three cards, the agent briefs for the brand, and fills the composer on a click', () => {
    mocks.briefs = {
      isBrandApproved: true,
      isLoading: false,
      proposals: [
        proposal('Lab to shelf'),
        proposal('Day in the studio'),
        proposal('Customer wins'),
        proposal('A fourth brief'),
      ],
    };
    const onSelectBrief = vi.fn();
    render(
      <StoryboardStarterCards
        onSelectBrief={onSelectBrief}
        onSelectPreset={vi.fn()}
      />,
    );

    const cards = within(
      screen.getByTestId('storyboard-starter-cards'),
    ).getAllByRole('button');
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Lab to shelf',
      'Day in the studio',
      'Customer wins',
    ]);
    expect(cards[0]).toHaveTextContent('2 shots · 12s');
    fireEvent.click(cards[0] as HTMLElement);
    expect(onSelectBrief).toHaveBeenCalledWith(proposal('Lab to shelf'));
  });

  it('falls back to three brand-neutral starters when the agent has no briefs', () => {
    const onSelectPreset = vi.fn();
    render(
      <StoryboardStarterCards
        onSelectBrief={vi.fn()}
        onSelectPreset={onSelectPreset}
      />,
    );

    const cards = within(
      screen.getByTestId('storyboard-starter-cards'),
    ).getAllByRole('button');
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Product launch teaser',
      'Founder story',
      'Before and after',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Founder story' }));
    expect(onSelectPreset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'founderStory' }),
    );
  });

  it('asks for brand kit approval above the three starters when the brand has none', () => {
    mocks.briefs = { isBrandApproved: false, isLoading: false, proposals: [] };
    render(
      <StoryboardStarterCards
        onSelectBrief={vi.fn()}
        onSelectPreset={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('storyboard-agent-briefs-approval'),
    ).toHaveTextContent(
      'Approve the brand kit so your agent can draft storyboards for this brand.',
    );
    expect(
      within(screen.getByTestId('storyboard-starter-cards')).getAllByRole(
        'button',
      ),
    ).toHaveLength(3);
  });

  it('says the agent is drafting while the briefs load, with no cards yet', () => {
    mocks.briefs = { isBrandApproved: true, isLoading: true, proposals: [] };
    render(
      <StoryboardStarterCards
        onSelectBrief={vi.fn()}
        onSelectPreset={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Your agent is drafting storyboards for this brand.',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
