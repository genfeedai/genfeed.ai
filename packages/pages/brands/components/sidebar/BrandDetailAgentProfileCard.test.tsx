import { LinkCategory } from '@genfeedai/contracts';
import BrandDetailAgentProfileCard from '@pages/brands/components/sidebar/BrandDetailAgentProfileCard';
import type { BrandDetailAgentProfileCardProps } from '@props/pages/brand-detail.props';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  errorMock,
  generateBrandVoiceMock,
  refreshBrandsMock,
  successMock,
  updateAgentConfigMock,
  warningMock,
} = vi.hoisted(() => ({
  errorMock: vi.fn(),
  generateBrandVoiceMock: vi.fn(),
  refreshBrandsMock: vi.fn().mockResolvedValue(undefined),
  successMock: vi.fn(),
  updateAgentConfigMock: vi.fn().mockResolvedValue(undefined),
  warningMock: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    refreshBrands: refreshBrandsMock,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generateBrandVoice: generateBrandVoiceMock,
    updateAgentConfig: updateAgentConfigMock,
  }),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    settings: {
      enabledModelIds: ['openai/gpt-5.6-luna'],
    },
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: errorMock,
      success: successMock,
      warning: warningMock,
    }),
  },
}));

describe('BrandDetailAgentProfileCard', () => {
  const onRefreshBrand = vi.fn().mockResolvedValue(undefined);

  const sufficientCorpus = {
    dateRange: { from: '2026-06-01', to: '2026-09-20' },
    isSufficient: true,
    label:
      'own posts: 42 samples (30 replies, 12 original) from twitter, 2026-06-01 to 2026-09-20',
    minimumSampleCount: 10,
    originalCount: 12,
    originCounts: { 'own-account': 42, pasted: 0, 'published-post': 0 },
    platforms: ['twitter'],
    replyCount: 30,
    sampleCount: 42,
  };

  const generatedProfile = {
    audience: ['founders'],
    corpus: sufficientCorpus,
    doNotSoundLike: ['hype'],
    exemplarTexts: [
      'shipped it, docs later',
      'nah, ship the boring version first',
    ],
    hashtags: ['#acme'],
    messagingPillars: ['clarity', 'proof'],
    prompting: { conversationStarters: [], seeds: [] },
    sampleOutput: 'A sharp, practical founder post.',
    strategy: { goals: ['awareness'], topics: ['product'] },
    style: 'plainspoken',
    taglines: ['Ship systems'],
    tone: 'confident',
    values: ['honesty'],
    writingRules: [
      'Keep replies short, under ~90 characters',
      'Never use em dashes',
    ],
  };

  const brand = {
    agentConfig: {
      platformOverrides: {},
      strategy: {
        contentTypes: [],
        frequency: '',
        goals: [],
        platforms: [],
      },
      voice: {
        audience: [],
        style: 'direct',
        tone: 'steady',
        values: [],
      },
    },
    label: 'Acme',
    links: [
      {
        category: LinkCategory.WEBSITE,
        id: 'link-1',
        label: 'Website',
        url: 'https://acme.example',
      },
    ],
  } as BrandDetailAgentProfileCardProps['brand'];

  beforeEach(() => {
    vi.clearAllMocks();
    updateAgentConfigMock.mockResolvedValue(undefined);
    generateBrandVoiceMock.mockResolvedValue(generatedProfile);
  });

  it('renders inline fields and keeps select controls without a Save button', () => {
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Manage' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Persona' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Messaging Pillars' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tone' })).toHaveTextContent(
      'steady',
    );
    expect(
      screen.getByRole('combobox', {
        name: 'Brand Content Generation Model Override',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Generate' }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
  });

  it('auto-saves a committed field with the full updated payload', async () => {
    const user = userEvent.setup();
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Messaging Pillars' }));
    const editor = screen.getByRole('textbox', {
      name: 'Messaging Pillars',
    });
    await user.clear(editor);
    await user.type(editor, 'clarity, proof');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(updateAgentConfigMock).toHaveBeenCalledWith('brand-1', {
        defaultModel: undefined,
        persona: '',
        platformOverrides: {},
        strategy: {
          contentTypes: [],
          frequency: '',
          goals: [],
          platforms: [],
        },
        voice: {
          approvedHooks: [],
          audience: [],
          bannedPhrases: [],
          canonicalSource: 'brand',
          doNotSoundLike: [],
          exemplarTexts: [],
          messagingPillars: ['clarity', 'proof'],
          sampleOutput: '',
          style: 'direct',
          tone: 'steady',
          values: [],
          writingRules: [],
        },
      });
    });

    expect(refreshBrandsMock).toHaveBeenCalledOnce();
    expect(onRefreshBrand).toHaveBeenCalledOnce();
    expect(successMock).not.toHaveBeenCalled();
  });

  it('auto-saves platform override fields in the full payload', async () => {
    const user = userEvent.setup();
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    // Platform overrides use a channel select; editor is always visible.
    expect(
      screen.getByRole('combobox', { name: 'Platform override channel' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'twitter Messaging Pillars Override',
      }),
    );
    const editor = screen.getByRole('textbox', {
      name: 'twitter Messaging Pillars Override',
    });
    await user.clear(editor);
    await user.type(editor, 'speed, practicality');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(updateAgentConfigMock).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          platformOverrides: {
            twitter: expect.objectContaining({
              strategy: expect.objectContaining({
                platforms: ['twitter'],
              }),
              voice: expect.objectContaining({
                messagingPillars: ['speed', 'practicality'],
              }),
            }),
          },
          voice: expect.objectContaining({
            style: 'direct',
            tone: 'steady',
          }),
        }),
      );
    });
  });

  it('reverts the inline value and reports an error when saving fails', async () => {
    const user = userEvent.setup();
    updateAgentConfigMock.mockRejectedValueOnce(new Error('save failed'));
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Tone' }));
    const editor = screen.getByRole('textbox', { name: 'Tone' });
    await user.clear(editor);
    await user.type(editor, 'bold');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tone' })).toHaveTextContent(
        'steady',
      ),
    );
    expect(errorMock).toHaveBeenCalledWith('Saving your brand voice', {
      description:
        'Your changes were not saved. Check your connection and try again.',
    });
    expect(refreshBrandsMock).not.toHaveBeenCalled();
    expect(onRefreshBrand).not.toHaveBeenCalled();
  });

  it('serializes quick field saves and preserves both updates', async () => {
    const user = userEvent.setup();
    let resolveFirstSave: (() => void) | undefined;
    updateAgentConfigMock
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Tone' }));
    await user.clear(screen.getByRole('textbox', { name: 'Tone' }));
    await user.type(screen.getByRole('textbox', { name: 'Tone' }), 'bold');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(updateAgentConfigMock).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: 'Style' }));
    await user.clear(screen.getByRole('textbox', { name: 'Style' }));
    await user.type(screen.getByRole('textbox', { name: 'Style' }), 'concise');
    await user.keyboard('{Enter}');

    expect(updateAgentConfigMock).toHaveBeenCalledOnce();
    resolveFirstSave?.();

    await waitFor(() => expect(updateAgentConfigMock).toHaveBeenCalledTimes(2));
    expect(updateAgentConfigMock).toHaveBeenLastCalledWith(
      'brand-1',
      expect.objectContaining({
        voice: expect.objectContaining({
          style: 'concise',
          tone: 'bold',
        }),
      }),
    );
  });

  it('generates voice from brand scan, fills the form, and saves', async () => {
    const user = userEvent.setup();
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Generate' })[0]);

    await waitFor(() => {
      expect(generateBrandVoiceMock).toHaveBeenCalledWith('brand-1', {
        brandId: 'brand-1',
        url: 'https://acme.example',
      });
    });

    await waitFor(() => {
      expect(updateAgentConfigMock).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          strategy: expect.objectContaining({
            contentTypes: ['product'],
            goals: ['awareness'],
          }),
          voice: expect.objectContaining({
            audience: ['founders'],
            doNotSoundLike: ['hype'],
            messagingPillars: ['clarity', 'proof'],
            sampleOutput: 'A sharp, practical founder post.',
            style: 'plainspoken',
            tone: 'confident',
            values: ['honesty'],
          }),
        }),
      );
    });

    expect(screen.getByRole('button', { name: 'Tone' })).toHaveTextContent(
      'confident',
    );
    expect(screen.getByRole('button', { name: 'Style' })).toHaveTextContent(
      'plainspoken',
    );
    expect(successMock).toHaveBeenCalledWith(
      'Brand voice generated and saved',
      { description: `Learned from ${sufficientCorpus.label}.` },
    );
    expect(
      screen.getByText(`Voice evidence: ${sufficientCorpus.label}`),
    ).toBeInTheDocument();
  });

  it('saves verbatim exemplars and measured rules without splitting on commas', async () => {
    const user = userEvent.setup();
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Generate' })[0]);

    await waitFor(() => {
      expect(updateAgentConfigMock).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          voice: expect.objectContaining({
            exemplarTexts: [
              'shipped it, docs later',
              'nah, ship the boring version first',
            ],
            writingRules: [
              'Keep replies short, under ~90 characters',
              'Never use em dashes',
            ],
          }),
        }),
      );
    });
  });

  it('warns with the fix when the own-posts corpus is too thin', async () => {
    const user = userEvent.setup();
    const guidance =
      'Only 3 posts written by this brand were found, which is too few to learn how you write.';
    generateBrandVoiceMock.mockResolvedValueOnce({
      ...generatedProfile,
      corpus: {
        ...sufficientCorpus,
        guidance,
        isSufficient: false,
        label: 'own posts: 3 samples (1 reply, 2 original) from twitter',
        sampleCount: 3,
      },
    });

    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Generate' })[0]);

    await waitFor(() =>
      expect(warningMock).toHaveBeenCalledWith(
        'Brand voice saved, but it will not sound like you yet',
        { description: guidance },
      ),
    );
    expect(successMock).not.toHaveBeenCalled();
    expect(screen.getByText(guidance)).toBeInTheDocument();
  });

  /**
   * `NotificationsService.error` renders `${message} failed`, so the first
   * argument has to stay a title. Asserting it here is what keeps the toast
   * from reading "Failed to generate brand voice failed" again.
   */
  it('reports the classified cause of a failed generation in one toast', async () => {
    const user = userEvent.setup();
    generateBrandVoiceMock.mockRejectedValueOnce({
      response: {
        data: {
          errors: [
            {
              code: 'incomplete_profile',
              detail: 'The generated brand profile is missing style.',
              meta: { isRetryable: true },
              status: '422',
              title: 'Brand voice generation failed',
            },
          ],
        },
      },
    });

    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Generate' })[0]);

    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1));
    expect(errorMock).toHaveBeenCalledWith('Generating your brand voice', {
      description:
        'The generated profile was missing key details. Try again, or add a website, description, or audience to the brand first.',
    });
    expect(successMock).not.toHaveBeenCalled();
    expect(updateAgentConfigMock).not.toHaveBeenCalled();
  });

  it('falls back to the generic message when the failure carries no code', async () => {
    const user = userEvent.setup();
    generateBrandVoiceMock.mockRejectedValueOnce(new Error('Network Error'));

    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Generate' })[0]);

    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1));
    expect(errorMock).toHaveBeenCalledWith('Generating your brand voice', {
      description: 'Something went wrong. Please try again.',
    });
  });

  it('never renders the server prose in the toast', async () => {
    const user = userEvent.setup();
    generateBrandVoiceMock.mockRejectedValueOnce({
      response: {
        data: {
          errors: [
            { code: 'malformed_output', detail: 'raw-provider-prose-marker' },
          ],
        },
      },
    });

    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Generate' })[0]);

    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(errorMock.mock.calls[0])).not.toContain(
      'raw-provider-prose-marker',
    );
  });
});
