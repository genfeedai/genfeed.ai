import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock(
  '@genfeedai/hooks/ui/use-intersection-observer/use-intersection-observer',
  () => ({
    useIntersectionObserver: () => ({
      isIntersecting: true,
      ref: { current: null },
    }),
  }),
);

vi.mock(
  '@hooks/ui/use-intersection-observer/use-intersection-observer',
  () => ({
    useIntersectionObserver: () => ({
      isIntersecting: true,
      ref: { current: null },
    }),
  }),
);

const useBrandMock = vi.fn();
const createRemixWorkflowMock = vi.fn();
const generateAdPackMock = vi.fn();
const getAdsResearchServiceMock = vi.fn();
const prepareCampaignForReviewMock = vi.fn();
let useQueryCallIndex = 0;

const publicAd = {
  accountName: 'Founders Club',
  body: 'Meta ad body copy',
  channel: 'all',
  credentialId: 'cred-meta',
  headline: 'Meta hook copy',
  id: 'public-1',
  imageUrls: ['https://cdn.example.com/meta-ad.jpg'],
  industry: 'SaaS',
  metrics: {
    conversions: 11,
    ctr: 1.3,
    performanceScore: 96,
    roas: 4.2,
    spendEfficiency: 1.4,
  },
  platform: 'meta',
  source: 'public',
  title: 'Meta hook story',
} as const;

const connectedAd = {
  accountName: 'Growth Account',
  adAccountId: 'acct-google-1',
  body: 'Google search ad body',
  channel: 'search',
  credentialId: 'cred-google',
  headline: 'Google lead gen headline',
  id: 'connected-1',
  industry: 'Marketing',
  loginCustomerId: 'mcc-111',
  metrics: {
    conversions: 19,
    ctr: 2.4,
    performanceScore: 99,
    roas: 5.5,
    spendEfficiency: 2.1,
  },
  platform: 'google',
  source: 'my_accounts',
  sourceId: 'source-google-1',
  title: 'Google lead gen winner',
} as const;

const detailResult = {
  accountName: 'Growth Account',
  campaignName: 'Search Prospecting',
  channel: 'search',
  creative: {
    body: 'Search detail body',
    headline: 'Search detail headline',
  },
  explanation: 'The ad aligns to search intent and converts well.',
  landingPageUrl: 'https://example.com/landing',
  metrics: {
    ctr: 2.4,
    roas: 5.5,
  },
  patternSummary: [
    {
      id: 'pattern-1',
      label: 'Intent capture',
      score: 93,
      summary: 'Uses search intent and a clear promise.',
    },
  ],
  platform: 'google',
  status: 'active',
  title: 'Google lead gen detail',
} as const;

const resultsState = {
  connectedAds: [connectedAd],
  filters: {},
  publicAds: [publicAd],
  summary: {
    connectedCount: 1,
    publicCount: 1,
    reviewPolicy: 'All remixes and launch prep remain paused for review.',
    selectedPlatform: 'all',
    selectedSource: 'all',
  },
};

const adAccountsState = [
  {
    currency: 'USD',
    id: 'acct-google-1',
    name: 'Growth Account',
    platform: 'google',
    status: 'active',
    timezone: 'UTC',
  },
];

const useQueryStates = [
  {
    data: resultsState,
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  },
  {
    data: adAccountsState,
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  },
  {
    data: detailResult,
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  },
];

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({
    brandSlug: 'moonrise-studio',
    orgSlug: 'moonrise-org',
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getAdsResearchServiceMock,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => useQueryStates[useQueryCallIndex++ % useQueryStates.length],
  useQueryClient: () => ({
    setQueryData: vi.fn(),
  }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
    right,
  }: {
    children: ReactNode;
    description?: string;
    label?: string;
    right?: ReactNode;
  }) => (
    <section>
      <header>
        <h1>{label}</h1>
        {description ? <p>{description}</p> : null}
        {right}
      </header>
      <div>{children}</div>
    </section>
  ),
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({ onClick }: { isRefreshing?: boolean; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      Refresh
    </button>
  ),
}));

vi.mock('@ui/primitives/searchbar', () => ({
  default: ({
    value,
    onChange,
    onClear,
    placeholder,
  }: {
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
    onClear?: () => void;
    placeholder?: string;
  }) => (
    <div>
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange?.(event)}
      />
      <button type="button" onClick={onClear}>
        Clear
      </button>
    </div>
  ),
}));

vi.mock('@ui/navigation/view-toggle/ViewToggle', () => ({
  default: ({
    activeView,
    onChange,
    options,
  }: {
    activeView: string;
    onChange: (view: string) => void;
    options: Array<{ label: string; type: string }>;
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.type}
          type="button"
          aria-pressed={activeView === option.type}
          onClick={() => onChange(option.type)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    ariaLabel,
    children,
    onClick,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    onClick?: () => void;
  }) => (
    <button aria-label={ariaLabel} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

vi.mock('@ui/buttons/dropdown/button-dropdown/ButtonDropdown', () => ({
  default: ({
    name,
    onChange,
  }: {
    name: string;
    onChange: (_name: string, value: string) => void;
  }) => (
    <button onClick={() => onChange(name, 'ctr')} type="button">
      Sort by CTR
    </button>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
}));

vi.mock('@ui/primitives/searchbar', () => ({
  default: ({
    onChange,
    onClear,
    placeholder,
    value,
  }: {
    onChange: (event: { target: { value: string } }) => void;
    onClear: () => void;
    placeholder?: string;
    value: string;
  }) => (
    <div>
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event as never)}
      />
      <button onClick={onClear} type="button">
        Clear
      </button>
    </div>
  ),
}));

vi.mock('@ui/navigation/view-toggle/ViewToggle', () => ({
  default: ({ onChange }: { onChange: (value: string) => void }) => (
    <div data-testid="view-toggle">
      <button type="button" onClick={() => onChange('table')}>
        Table view
      </button>
      <button type="button" onClick={() => onChange('grid')}>
        Grid view
      </button>
    </div>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    onChange,
    placeholder,
    value,
  }: {
    onChange: (event: { target: { value: string } }) => void;
    placeholder?: string;
    value: string;
  }) => (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event as never)}
    />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children?: ReactNode;
    onValueChange?: (value: string) => void;
  }) => (
    <div>
      {children}
      <button type="button" onClick={() => onValueChange?.('cred-google')}>
        Select Google Credential
      </button>
      <button type="button" onClick={() => onValueChange?.('acct-google-1')}>
        Select Google Account
      </button>
    </div>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children?: ReactNode;
    value: string;
  }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

import AdsResearchPageClient from './AdsResearchPageClient';

describe('AdsResearchPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryCallIndex = 0;
    useQueryStates[0].data = resultsState;
    useQueryStates[0].error = null;
    useQueryStates[0].isLoading = false;
    useQueryStates[1].data = adAccountsState;
    useQueryStates[1].error = null;
    useQueryStates[1].isLoading = false;
    useQueryStates[2].data = detailResult;
    useQueryStates[2].error = null;
    useQueryStates[2].isLoading = false;
    createRemixWorkflowMock.mockResolvedValue({
      adPack: {
        assetCreativeBrief: 'Workflow creative brief',
        campaignRecipe: {
          budgetStrategy: 'Start with a $50 daily validation budget.',
          channel: 'search',
          placements: ['Search'],
          platform: 'google',
        },
        cta: 'Book demo',
        headlines: ['Workflow headline'],
        primaryText: 'Workflow primary text',
        targetingNotes: 'Target founders.',
      },
      workflowDescription: 'Workflow description',
      workflowId: 'workflow-1',
      workflowName: 'Ads remix workflow',
    });
    generateAdPackMock.mockResolvedValue({
      assetCreativeBrief: 'Ad pack creative brief',
      campaignRecipe: {
        budgetStrategy: 'Spend carefully.',
        channel: 'search',
        placements: ['Search'],
        platform: 'google',
      },
      cta: 'Start now',
      headlines: ['Ad pack headline'],
      primaryText: 'Ad pack primary text',
      targetingNotes: 'Target operators.',
    });
    prepareCampaignForReviewMock.mockResolvedValue({
      ad: { name: 'Launch ad' },
      adPack: {
        assetCreativeBrief: 'Launch creative brief',
        campaignRecipe: {
          budgetStrategy: 'Launch with a constrained test budget.',
          channel: 'search',
          placements: ['Search'],
          platform: 'google',
        },
        cta: 'Launch',
        headlines: ['Launch headline'],
        primaryText: 'Launch primary text',
        targetingNotes: 'Target high-intent searches.',
      },
      adSet: { name: 'Launch ad set', optimizationGoal: 'Conversions' },
      campaign: { name: 'Launch campaign', objective: 'Conversions' },
      notes: ['Review creative before publishing.'],
      publishMode: 'paused',
      workflowId: 'workflow-launch',
      workflowName: 'Launch workflow',
    });
    getAdsResearchServiceMock.mockResolvedValue({
      createRemixWorkflow: createRemixWorkflowMock,
      generateAdPack: generateAdPackMock,
      prepareCampaignForReview: prepareCampaignForReviewMock,
    });
    useBrandMock.mockReturnValue({
      brandId: 'brand-1',
      credentials: [
        { externalHandle: 'Google Ads', id: 'cred-google', platform: 'google' },
        { externalHandle: 'Meta Ads', id: 'cred-meta', platform: 'meta' },
      ],
      isReady: true,
      selectedBrand: { label: 'Moonrise Studio' },
    });
  });

  it('filters ads, opens detail sidebar, and exposes launch actions', () => {
    useQueryStates[0].refetch.mockClear();
    useQueryStates[1].refetch.mockClear();
    useQueryStates[2].refetch.mockClear();

    const { container } = render(<AdsResearchPageClient />);

    expect(screen.getByRole('heading', { name: 'Ads' })).toBeInTheDocument();
    // Compact stats strip (labels also appear on ad badges — use counts).
    expect(screen.getByText('Source')).toBeInTheDocument();
    // Launch policy is a footnote when credentials exist — not a second alert.
    expect(screen.getByText(/remain paused for review/i)).toBeInTheDocument();
    expect(screen.queryByText('Launch policy')).not.toBeInTheDocument();
    expect(screen.queryByText('Review Policy')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /filters/i }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search ads')).toBeInTheDocument();
    expect(screen.getByText('Meta hook story')).toBeInTheDocument();
    expect(screen.getByText('Google lead gen winner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('Timeframe')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search ads'), {
      target: { value: 'google' },
    });

    expect(screen.queryByText('Meta hook story')).not.toBeInTheDocument();
    expect(screen.getByText('Google lead gen winner')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Google lead gen winner/i }),
    );

    expect(
      screen.getByRole('heading', { name: 'Ad Detail' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Google lead gen detail')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /close detail/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remix for my brand/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create workflow/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /prepare campaign/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open landing page/i }),
    ).toHaveAttribute('href', 'https://example.com/landing');
    expect(screen.queryByText('Workflow Created')).not.toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });

  it('switches to table mode, refreshes, and runs remix workflow actions', async () => {
    render(<AdsResearchPageClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Title')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sort by CTR' }));
    expect(screen.getByText('2.40')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(useQueryStates[0].refetch).toHaveBeenCalled();
    // Refresh lives in the Container header next to view toggle.

    fireEvent.click(screen.getByText('Google lead gen winner'));
    fireEvent.click(screen.getByRole('button', { name: /create workflow/i }));

    expect(await screen.findByText('Workflow Created')).toBeInTheDocument();
    expect(screen.getByText('Ads remix workflow')).toBeInTheDocument();
    expect(createRemixWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adId: 'source-google-1',
        brandName: 'Moonrise Studio',
        source: 'my_accounts',
      }),
    );
    expect(
      screen.getByRole('link', { name: /open workflow editor/i }),
    ).toHaveAttribute(
      'href',
      '/moonrise-org/moonrise-studio/automate/workflows/workflow-1',
    );
  });

  it('generates ad packs and campaign launch prep for selected connected ads', async () => {
    render(<AdsResearchPageClient initialPlatform="google" />);

    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    expect(screen.getByText('Google Channel')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('MCC / manager ID')).toBeInTheDocument();
    expect(screen.queryByText('Platform')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Google lead gen winner/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /remix for my brand/i }),
    );

    expect(await screen.findByText('Ad Pack Ready')).toBeInTheDocument();
    expect(screen.getByText('Ad pack headline')).toBeInTheDocument();
    expect(generateAdPackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adAccountId: 'acct-google-1',
        credentialId: 'cred-google',
        platform: 'google',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /prepare campaign/i }));

    expect(await screen.findByText('Review Required')).toBeInTheDocument();
    expect(screen.getByText('Launch campaign')).toBeInTheDocument();
    expect(
      screen.getByText('Review creative before publishing.'),
    ).toBeInTheDocument();
    expect(prepareCampaignForReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignName: 'Moonrise Studio Google Campaign',
        createWorkflow: true,
        dailyBudget: 50,
      }),
    );
    expect(
      screen.getByRole('link', { name: /open linked workflow/i }),
    ).toHaveAttribute(
      'href',
      '/moonrise-org/moonrise-studio/automate/workflows/workflow-launch',
    );
  });

  it('shows empty, loading, error, and action failure states', async () => {
    // Credentials present, list empty → filter empty (not setup CTA).
    useQueryStates[0].data = {
      ...resultsState,
      connectedAds: [],
      publicAds: [],
      summary: {
        ...resultsState.summary,
        connectedCount: 0,
        publicCount: 0,
      },
    };
    useQueryStates[0].error = new Error('research unavailable');
    useQueryStates[1].error = new Error('accounts unavailable');
    useQueryStates[2].error = new Error('detail unavailable');
    useQueryStates[2].isLoading = true;

    const { rerender } = render(<AdsResearchPageClient />);

    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      'detail unavailable',
    );
    expect(
      screen.getByText(
        'No ads match the current filters. Adjust filters or widen the timeframe.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Connect Meta, Google/YouTube, or TikTok Ads'),
    ).not.toBeInTheDocument();

    useQueryCallIndex = 0;
    useQueryStates[0].isLoading = true;
    rerender(<AdsResearchPageClient />);
    expect(
      screen.queryByText(
        'No ads match the current filters. Adjust filters or widen the timeframe.',
      ),
    ).not.toBeInTheDocument();

    useQueryCallIndex = 0;
    useQueryStates[0].data = resultsState;
    useQueryStates[0].error = null;
    useQueryStates[0].isLoading = false;
    useQueryStates[1].error = null;
    useQueryStates[2].data = null;
    useQueryStates[2].error = null;
    useQueryStates[2].isLoading = true;
    createRemixWorkflowMock.mockRejectedValueOnce(new Error('workflow failed'));
    rerender(<AdsResearchPageClient />);

    fireEvent.click(
      screen.getByRole('button', { name: /Google lead gen winner/i }),
    );
    expect(screen.getByText('Loading ad detail…')).toBeInTheDocument();

    useQueryCallIndex = 0;
    useQueryStates[2].data = detailResult;
    useQueryStates[2].isLoading = false;
    rerender(<AdsResearchPageClient />);
    fireEvent.click(screen.getByRole('button', { name: /create workflow/i }));

    expect(await screen.findByText('workflow failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close detail/i }));
    expect(screen.queryByRole('heading', { name: 'Ad Detail' })).toBeNull();
  });

  it('shows a full connect empty state when there are no credentials and no ads', () => {
    useBrandMock.mockReturnValue({
      brandId: 'brand-1',
      credentials: [],
      isReady: true,
      selectedBrand: { label: 'Moonrise Studio' },
    });
    useQueryStates[0].data = {
      ...resultsState,
      connectedAds: [],
      publicAds: [],
      summary: {
        ...resultsState.summary,
        connectedCount: 0,
        publicCount: 0,
      },
    };

    render(<AdsResearchPageClient />);

    expect(
      screen.getByText('Connect Meta, Google/YouTube, or TikTok Ads'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No ads match the current filters.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search ads')).not.toBeInTheDocument();
    // No list chrome on setup empty — tabs / refresh / view toggle stay off.
    expect(
      screen.queryByRole('button', { name: 'Refresh' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Grid view' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Table view' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Manage ad connections' }),
    ).toHaveAttribute('href', '/moonrise-org/moonrise-studio/settings/social');
  });

  it('keeps public ads visible and a slim connect strip when only public winners exist', () => {
    useBrandMock.mockReturnValue({
      brandId: 'brand-1',
      credentials: [],
      isReady: true,
      selectedBrand: { label: 'Moonrise Studio' },
    });
    // Default resultsState has public + connected ads; strip connected.
    useQueryStates[0].data = {
      ...resultsState,
      connectedAds: [],
      summary: {
        ...resultsState.summary,
        connectedCount: 0,
      },
    };

    render(<AdsResearchPageClient />);

    expect(screen.getByText('Meta hook story')).toBeInTheDocument();
    expect(
      screen.getByText('Connect accounts for your campaigns'),
    ).toBeInTheDocument();
    // The strip is the only place the surface names the connectable ad
    // platforms — it has to list every one the connections page offers.
    expect(
      screen.getByText(
        'Showing public winners only. Connect Meta, Google/YouTube, or TikTok Ads to pull in your own campaigns.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search ads')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Manage ad connections' }),
    ).toBeInTheDocument();
  });
});
