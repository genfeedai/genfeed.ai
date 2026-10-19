import StudioPlaygroundAgentProposals from '@pages/studio/playground/components/StudioPlaygroundAgentProposals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  propose: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ propose: mocks.propose }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const PROPOSAL = {
  aspectRatio: '4:5',
  prompt: 'Flat-lay of the serum on wet stone, morning light.',
  title: 'Morning ritual',
  why: 'Ritual shots doubled saves last month.',
};

describe('StudioPlaygroundAgentProposals', () => {
  beforeEach(() => {
    mocks.propose.mockReset();
  });

  it('shows the agent drafts and fills the prompt and aspect ratio', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: true,
      proposals: [PROPOSAL],
      surface: 'image',
    });
    const onSelect = vi.fn();
    render(
      <StudioPlaygroundAgentProposals
        brandId="brand-1"
        onSelect={onSelect}
        type="image"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Your agent is drafting ideas for this brand.',
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Use draft: Morning ritual',
      }),
    );

    expect(mocks.propose).toHaveBeenCalledWith('brand-1', 'image', {
      signal: expect.any(AbortSignal),
    });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '4:5',
        content: {
          content: [
            {
              content: [{ text: PROPOSAL.prompt, type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
        type: 'image',
      }),
    );
    expect(screen.getByText(PROPOSAL.why)).toBeInTheDocument();
  });

  it('asks for brand kit approval when the brand has no approved Brand OS', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: false,
      proposals: [],
      surface: 'video',
    });
    render(
      <StudioPlaygroundAgentProposals
        brandId="brand-1"
        onSelect={vi.fn()}
        type="video"
      />,
    );

    expect(
      await screen.findByTestId('studio-playground-agent-proposals-approval'),
    ).toHaveTextContent(
      'Approve the brand kit so your agent can draft ideas for this brand.',
    );
  });

  it('renders nothing when the call fails, leaving the starter ideas', async () => {
    mocks.propose.mockRejectedValue(new Error('boom'));
    const { container } = render(
      <StudioPlaygroundAgentProposals
        brandId="brand-1"
        onSelect={vi.fn()}
        type="image"
      />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('asks for nothing on types without proposals or without a brand', () => {
    const { container, rerender } = render(
      <StudioPlaygroundAgentProposals
        brandId="brand-1"
        onSelect={vi.fn()}
        type="music"
      />,
    );
    rerender(
      <StudioPlaygroundAgentProposals onSelect={vi.fn()} type="image" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(mocks.propose).not.toHaveBeenCalled();
  });
});
