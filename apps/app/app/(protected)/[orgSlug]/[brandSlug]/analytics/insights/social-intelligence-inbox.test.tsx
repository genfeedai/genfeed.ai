import { useSocialIntelligence } from '@hooks/data/analytics/use-social-intelligence/use-social-intelligence';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SocialIntelligenceInbox from './social-intelligence-inbox';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  createBrief: vi.fn(),
  createDraft: vi.fn(),
  retry: vi.fn(),
  reviewTheme: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@hooks/data/analytics/use-social-intelligence/use-social-intelligence',
  () => ({
    useSocialIntelligence: vi.fn(),
  }),
);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(
    (factory: (token: string) => unknown) => async () => factory('token'),
  ),
}));

vi.mock('@services/content/content-runs.service', () => ({
  ContentRunsService: {
    getInstance: () => ({ createResearchBriefRun: mocks.createBrief }),
  },
}));

vi.mock('@services/social/source-posts.service', () => ({
  SourcePostsService: {
    getInstance: () => ({ createDraft: mocks.createDraft }),
  },
}));

const readyItem = {
  evidence: [
    {
      contentExcerpt: 'AI agents are changing publishing workflows.',
      freshnessExpiresAt: '2099-08-27T12:00:00.000Z',
      id: 'evidence-1',
      platform: 'x',
      sourcePostId: 'source-post-1',
      sourceUrl: 'https://example.com/evidence',
    },
  ],
  signals: [
    {
      analysisKey: 'analysis-1',
      excludedSourceIds: [],
      includedSourceIds: ['source-1'],
      insufficiencyReason: null,
      status: 'sufficient',
    },
  ],
  themes: [
    {
      analysisKey: 'analysis-1',
      currentWindowEnd: '2026-08-26T12:00:00.000Z',
      currentWindowStart: '2026-08-25T12:00:00.000Z',
      evidenceIds: ['evidence-1'],
      id: 'theme-1',
      label: 'AI agents',
      previousWindowEnd: '2026-08-25T12:00:00.000Z',
      previousWindowStart: '2026-08-24T12:00:00.000Z',
      reviewState: 'unreviewed',
    },
  ],
  topic: {
    id: 'topic-1',
    label: 'Agent discourse',
    sources: [
      {
        collectionState: 'success',
        id: 'topic-source-1',
        platform: 'x',
        sourceId: 'source-1',
      },
    ],
  },
};

function mockInbox(overrides: Record<string, unknown> = {}) {
  vi.mocked(useSocialIntelligence).mockReturnValue({
    errorMessage: null,
    isReviewing: false,
    items: [readyItem],
    partialReason: null,
    retry: mocks.retry,
    reviewTheme: mocks.reviewTheme,
    state: 'ready',
    ...overrides,
  } as unknown as ReturnType<typeof useSocialIntelligence>);
}

describe('SocialIntelligenceInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createBrief.mockResolvedValue({ id: 'run-1' });
    mocks.createDraft.mockResolvedValue({ draftId: 'draft-1' });
    mocks.reviewTheme.mockResolvedValue(undefined);
    mockInbox();
  });

  it('renders topic, theme, evidence, windows, freshness, URLs, and source coverage', () => {
    render(
      <SocialIntelligenceInbox organizationId="org-1" brandId="brand-1" />,
    );

    expect(screen.getByText('Agent discourse')).toBeInTheDocument();
    expect(screen.getByText('AI agents')).toBeInTheDocument();
    expect(screen.getByText('1 evidence item')).toBeInTheDocument();
    expect(
      screen.getByText('AI agents are changing publishing workflows.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute(
      'href',
      'https://example.com/evidence',
    );
    expect(screen.getByText(/Current window/)).toBeInTheDocument();
    expect(screen.getByText(/Previous window/)).toBeInTheDocument();
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(screen.getByText('Included: x')).toBeInTheDocument();
  });

  it.each([
    ['loading', 'Loading social intelligence…'],
    ['empty', 'No listening themes yet'],
    ['forbidden', 'You do not have access to this social intelligence inbox'],
    ['rate_limited', 'Social sources are rate limited'],
    ['failed', 'Social intelligence could not be loaded'],
  ] as const)('renders the %s fixture recoverably', (state, message) => {
    mockInbox({ items: [], state });
    render(
      <SocialIntelligenceInbox organizationId="org-1" brandId="brand-1" />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
    if (
      state === 'forbidden' ||
      state === 'rate_limited' ||
      state === 'failed'
    ) {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(mocks.retry).toHaveBeenCalled();
    }
  });

  it('renders the page shell while the inbox is loading', () => {
    mockInbox({ items: [], state: 'loading' });

    render(
      <SocialIntelligenceInbox organizationId="org-1" brandId="brand-1" />,
    );

    expect(screen.getByText('Social intelligence inbox')).toBeVisible();
    expect(
      screen.getByText(
        'Review attributable listening themes before creating downstream work.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Loading social intelligence…')).toBeVisible();
  });

  it('acknowledges and defers a theme through the durable review mutation', async () => {
    const user = userEvent.setup();
    render(
      <SocialIntelligenceInbox organizationId="org-1" brandId="brand-1" />,
    );

    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await user.click(screen.getByRole('button', { name: 'Defer' }));

    expect(mocks.reviewTheme).toHaveBeenNthCalledWith(
      1,
      'topic-1',
      'theme-1',
      'acknowledged',
    );
    expect(mocks.reviewTheme).toHaveBeenNthCalledWith(
      2,
      'topic-1',
      'theme-1',
      'deferred',
    );
  });

  it('creates a non-publishing brief with listening IDs and evidence lines', async () => {
    const user = userEvent.setup();
    render(
      <SocialIntelligenceInbox organizationId="org-1" brandId="brand-1" />,
    );

    await user.click(screen.getByRole('button', { name: 'Create brief' }));

    expect(mocks.createBrief).toHaveBeenCalledWith(
      'brand-1',
      expect.objectContaining({
        evidence: [
          'AI agents are changing publishing workflows. — https://example.com/evidence',
        ],
        metrics: {
          listeningAnalysisKey: 'analysis-1',
          listeningEvidenceIds: ['evidence-1'],
          listeningThemeId: 'theme-1',
          listeningTopicId: 'topic-1',
        },
        sourceContentId: 'theme-1',
        sourceReferenceId: 'analysis-1',
        trendId: 'theme-1',
      }),
    );
    expect(screen.getByText('Brief created as a content run')).toBeVisible();
  });

  it('creates a draft response only from selected evidence with a source post', async () => {
    const user = userEvent.setup();
    render(
      <SocialIntelligenceInbox organizationId="org-1" brandId="brand-1" />,
    );

    await user.click(
      screen.getByRole('radio', { name: /AI agents are changing/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Create response' }));

    expect(mocks.createDraft).toHaveBeenCalledWith(
      'source-post-1',
      {
        actionType: 'reply',
        listeningEvidenceIds: ['evidence-1'],
        listeningThemeId: 'theme-1',
        listeningTopicId: 'topic-1',
      },
      { brandId: 'brand-1' },
    );
    expect(screen.getByText('Response saved as a draft')).toBeVisible();
  });

  it('requires confirmation before either content action when coverage is partial', async () => {
    const user = userEvent.setup();
    mockInbox({
      items: [
        {
          ...readyItem,
          signals: [
            {
              ...readyItem.signals[0],
              excludedSourceIds: ['source-2'],
              insufficiencyReason: 'source_coverage_gap',
              status: 'insufficient_evidence',
            },
          ],
          topic: {
            ...readyItem.topic,
            sources: [
              ...readyItem.topic.sources,
              {
                collectionState: 'failed',
                id: 'topic-source-2',
                lastCollectionError: 'Credential missing',
                platform: 'linkedin',
                sourceId: 'source-2',
              },
            ],
          },
        },
      ],
      partialReason: 'Missing linkedin coverage: Credential missing',
      state: 'partial',
    });
    render(
      <SocialIntelligenceInbox organizationId="org-1" brandId="brand-1" />,
    );

    expect(screen.getAllByText(/Missing linkedin coverage/)).not.toHaveLength(
      0,
    );
    await user.click(
      screen.getByRole('radio', { name: /AI agents are changing/ }),
    );
    expect(screen.getByRole('button', { name: 'Create brief' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Create response' }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole('checkbox', {
        name: 'I understand this theme has partial source coverage',
      }),
    );
    expect(screen.getByRole('button', { name: 'Create brief' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Create response' }),
    ).toBeEnabled();
  });

  it('keeps unavailable evidence and missing credentials recoverable', async () => {
    const user = userEvent.setup();
    mockInbox({
      items: [
        {
          ...readyItem,
          evidence: [
            {
              ...readyItem.evidence[0],
              sourcePostId: null,
            },
          ],
        },
      ],
    });
    const { rerender } = render(
      <SocialIntelligenceInbox organizationId="org-1" brandId="brand-1" />,
    );
    expect(
      screen.getByText('Response unavailable for this evidence'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Create response' }),
    ).toBeDisabled();

    mockInbox();
    mocks.createDraft.mockRejectedValueOnce(
      Object.assign(new Error('Connect a credential before drafting'), {
        status: 400,
      }),
    );
    rerender(
      <SocialIntelligenceInbox organizationId="org-1" brandId="brand-1" />,
    );
    await user.click(
      screen.getByRole('radio', { name: /AI agents are changing/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Create response' }));
    await waitFor(() =>
      expect(
        screen.getByText('Connect a credential before drafting'),
      ).toBeVisible(),
    );
    expect(
      screen.getByRole('button', { name: 'Create response' }),
    ).toBeEnabled();
  });
});
