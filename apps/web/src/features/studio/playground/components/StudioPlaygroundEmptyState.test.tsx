import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioPlaygroundEmptyState from '@/features/studio/playground/components/StudioPlaygroundEmptyState';

const mocks = vi.hoisted(() => {
  const propose = vi.fn();
  return {
    getService: vi.fn(async () => ({ propose })),
    propose,
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
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

function cardLabels(): string[] {
  return screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '');
}

describe('StudioPlaygroundEmptyState', () => {
  beforeEach(() => {
    mocks.propose.mockReset();
  });

  it('centers a title and subtitle over three starter cards for the open type', () => {
    render(<StudioPlaygroundEmptyState onSelect={vi.fn()} type="image" />);

    expect(
      screen.getByRole('heading', { name: 'Start creating' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pick an idea below or write your own prompt.'),
    ).toBeInTheDocument();
    expect(cardLabels()).toEqual([
      'Product photo',
      'Product ad',
      'Cinematic video',
    ]);
  });

  it('leads with the ideas for the selected type', () => {
    render(<StudioPlaygroundEmptyState onSelect={vi.fn()} type="voice" />);

    expect(cardLabels()[0]).toBe('Voiceover');
    expect(cardLabels()).toHaveLength(3);
  });

  it('fills a plain product photo when its card is picked', () => {
    const onSelect = vi.fn();
    render(<StudioPlaygroundEmptyState onSelect={onSelect} type="image" />);

    fireEvent.click(screen.getByRole('button', { name: 'Product photo' }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '1:1',
        promptTemplate: 'product-photo',
        openLibraryRole: 'reference',
        type: 'image',
        content: {
          content: [
            {
              content: [
                {
                  text: 'Product photo on a clean studio background, soft shadow, sharp detail.',
                  type: 'text',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
      }),
    );
  });

  it('tags the brand character inside image and video ideas', () => {
    const onSelect = vi.fn();
    render(
      <StudioPlaygroundEmptyState
        character={{ handle: 'anna', id: 'char-anna', label: 'Anna' }}
        onSelect={onSelect}
        type="image"
      />,
    );

    expect(screen.getAllByText(/Tags Anna/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Product ad' }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '9:16',
        openLibraryRole: 'startFrame',
        promptTemplate: 'influencer-video',
        type: 'video',
        content: expect.objectContaining({
          content: [
            expect.objectContaining({
              content: expect.arrayContaining([
                expect.objectContaining({
                  attrs: { handle: 'anna', id: 'char-anna', label: 'Anna' },
                  type: 'characterMention',
                }),
              ]),
            }),
          ],
        }),
      }),
    );
  });

  it('attaches the brand product and asks for one when the kit has none', () => {
    const onSelect = vi.fn();
    const product = {
      id: 'bottle-1',
      label: 'Bottle',
      previewUrl: 'https://cdn.example/bottle.png',
    };
    const { rerender } = render(
      <StudioPlaygroundEmptyState
        onSelect={onSelect}
        productReference={product}
        type="image"
      />,
    );

    expect(screen.getAllByText(/Uses Bottle/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Product photo' }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        productReference: { ...product, role: 'reference' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Product ad' }));
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        productReference: { ...product, role: 'startFrame' },
        type: 'video',
      }),
    );

    rerender(
      <StudioPlaygroundEmptyState
        onSelect={onSelect}
        productReference={{
          id: 'bottle-1',
          previewUrl: 'https://cdn.example/bottle.png',
        }}
        type="image"
      />,
    );
    expect(screen.getAllByText(/Uses Product/)).toHaveLength(2);

    rerender(<StudioPlaygroundEmptyState onSelect={onSelect} type="image" />);
    expect(screen.getAllByText(/Add a product image/)).toHaveLength(2);
  });

  it('writes a software ad about the person, not a physical product', () => {
    const onSelect = vi.fn();
    render(
      <StudioPlaygroundEmptyState
        offeringKind="software"
        onSelect={onSelect}
        type="image"
      />,
    );

    expect(screen.queryByText(/Add a product image/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Product ad' }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.not.objectContaining({
        openLibraryRole: expect.anything(),
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTemplate: undefined,
        content: {
          content: [
            {
              content: [
                {
                  text: 'Short ad for the software. Open on the person who just found the right match, name that feeling, end on the brand. No device, bottle, or package.',
                  type: 'text',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
      }),
    );
  });

  it('leads with the agent drafts and fills the prompt and aspect ratio', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: true,
      proposals: [PROPOSAL],
      surface: 'image',
    });
    const onSelect = vi.fn();
    render(
      <StudioPlaygroundEmptyState
        brandId="brand-1"
        onSelect={onSelect}
        type="image"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Your agent is drafting ideas for this brand.',
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Morning ritual' }),
    );

    expect(cardLabels()).toEqual([
      'Morning ritual',
      'Product photo',
      'Product ad',
    ]);
    expect(screen.getByText(PROPOSAL.why)).toBeInTheDocument();
    expect(mocks.propose).toHaveBeenCalledWith('brand-1', 'image', {
      count: 3,
      signal: expect.any(AbortSignal),
    });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPrompt: PROPOSAL.prompt,
        aspectRatio: '4:5',
        type: 'image',
        content: {
          content: [
            {
              content: [{ text: PROPOSAL.prompt, type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
      }),
    );
  });

  it('asks for brand kit approval when the brand has no approved Brand OS', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: false,
      proposals: [],
      surface: 'video',
    });
    render(
      <StudioPlaygroundEmptyState
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
    expect(cardLabels()).toHaveLength(3);
  });

  it('keeps the starter ideas when the agent call fails', async () => {
    mocks.propose.mockRejectedValue(new Error('boom'));
    render(
      <StudioPlaygroundEmptyState
        brandId="brand-3"
        onSelect={vi.fn()}
        type="image"
      />,
    );

    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    );
    expect(cardLabels()).toEqual([
      'Product photo',
      'Product ad',
      'Cinematic video',
    ]);
  });

  it('shows at most three cards and reuses the drafts after a remount', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: true,
      proposals: [1, 2, 3, 4].map((index) => ({
        ...PROPOSAL,
        title: `Draft ${index}`,
      })),
      surface: 'image',
    });
    const view = render(
      <StudioPlaygroundEmptyState
        brandId="brand-4"
        onSelect={vi.fn()}
        type="image"
      />,
    );
    await screen.findByRole('button', { name: 'Draft 1' });
    expect(cardLabels()).toEqual(['Draft 1', 'Draft 2', 'Draft 3']);
    view.unmount();

    render(
      <StudioPlaygroundEmptyState
        brandId="brand-4"
        onSelect={vi.fn()}
        type="image"
      />,
    );

    expect(cardLabels()).toEqual(['Draft 1', 'Draft 2', 'Draft 3']);
    expect(mocks.propose).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing on types without proposals or without a brand', () => {
    const { rerender } = render(
      <StudioPlaygroundEmptyState
        brandId="brand-1"
        onSelect={vi.fn()}
        type="music"
      />,
    );
    rerender(<StudioPlaygroundEmptyState onSelect={vi.fn()} type="image" />);

    expect(mocks.propose).not.toHaveBeenCalled();
    expect(cardLabels()).toHaveLength(3);
  });
});
