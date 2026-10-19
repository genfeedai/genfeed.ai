import StudioPlaygroundAgentProposals from '@pages/studio/playground/components/StudioPlaygroundAgentProposals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const propose = vi.fn();
  return {
    getService: vi.fn(async () => ({ propose })),
    propose,
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    orgId: 'org-1',
    sessionId: 'session-1',
    userId: 'user-1',
  }),
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

    expect(mocks.propose).toHaveBeenCalledTimes(1);
    expect(mocks.propose).toHaveBeenCalledWith('brand-1', 'image', {
      count: 3,
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
        brandId="brand-2"
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
        brandId="brand-3"
        onSelect={vi.fn()}
        type="image"
      />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows at most three drafts and reuses them after a remount', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: true,
      proposals: [1, 2, 3, 4].map((index) => ({
        ...PROPOSAL,
        title: `Draft ${index}`,
      })),
      surface: 'image',
    });
    const view = render(
      <StudioPlaygroundAgentProposals
        brandId="brand-4"
        onSelect={vi.fn()}
        type="image"
      />,
    );
    await screen.findByRole('button', { name: 'Use draft: Draft 1' });
    expect(screen.getAllByRole('button')).toHaveLength(3);
    view.unmount();

    render(
      <StudioPlaygroundAgentProposals
        brandId="brand-4"
        onSelect={vi.fn()}
        type="image"
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(mocks.propose).toHaveBeenCalledTimes(1);
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
