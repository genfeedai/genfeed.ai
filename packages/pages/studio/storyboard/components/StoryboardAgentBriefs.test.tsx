import StoryboardAgentBriefs from '@pages/studio/storyboard/components/StoryboardAgentBriefs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  propose: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ propose: mocks.propose }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const PROPOSAL = {
  brief: 'A founder shows the serum going from lab to shelf.',
  shots: [
    { description: 'Lab bench close-up', durationSeconds: 5 },
    { description: 'Bottle on the shelf', durationSeconds: 7 },
  ],
  title: 'Lab to shelf',
  why: 'Origin stories held viewers longest.',
};

describe('StoryboardAgentBriefs', () => {
  beforeEach(() => {
    mocks.propose.mockReset();
  });

  it('shows the agent briefs with their shot count and runtime', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: true,
      proposals: [PROPOSAL],
      surface: 'storyboard',
    });
    const onSelect = vi.fn();
    render(<StoryboardAgentBriefs brandId="brand-a" onSelect={onSelect} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Your agent is drafting storyboards for this brand.',
    );
    const card = await screen.findByRole('button', {
      name: 'Use brief: Lab to shelf',
    });
    expect(card).toHaveTextContent('2 shots · 12s');
    fireEvent.click(card);

    expect(mocks.propose).toHaveBeenCalledWith('brand-a', 'storyboard', {
      signal: expect.any(AbortSignal),
    });
    expect(onSelect).toHaveBeenCalledWith(PROPOSAL);
  });

  it('asks for brand kit approval when the brand has no approved Brand OS', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: false,
      proposals: [],
      surface: 'storyboard',
    });
    render(<StoryboardAgentBriefs brandId="brand-a" onSelect={vi.fn()} />);

    expect(
      await screen.findByTestId('storyboard-agent-briefs-approval'),
    ).toHaveTextContent(
      'Approve the brand kit so your agent can draft storyboards for this brand.',
    );
  });

  it('renders nothing when the call fails or there is no brand', async () => {
    mocks.propose.mockRejectedValue(new Error('boom'));
    const { container, rerender } = render(
      <StoryboardAgentBriefs brandId="brand-a" onSelect={vi.fn()} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());

    mocks.propose.mockClear();
    rerender(<StoryboardAgentBriefs onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.propose).not.toHaveBeenCalled();
  });
});
