import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const useBrandMock = vi.fn();
let useResourceCallIndex = 0;

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

const useResourceStates = [
  {
    data: resultsState,
    error: null,
    isLoading: false,
    refresh: vi.fn(),
  },
  {
    data: adAccountsState,
    error: null,
    isLoading: false,
    refresh: vi.fn(),
  },
  {
    data: detailResult,
    error: null,
    isLoading: false,
    refresh: vi.fn(),
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
  useAuthedService: () => vi.fn(),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: () =>
    useResourceStates[useResourceCallIndex++ % useResourceStates.length],
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
    value,
  }: {
    name: string;
    onChange: (_name: string, value: string) => void;
    value: string;
  }) => (
    <button onClick={() => onChange(name, value)} type="button">
      {value}
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
  default: () => <div data-testid="view-toggle" />,
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
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
    useResourceCallIndex = 0;
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
    useResourceStates[0].refresh.mockClear();
    useResourceStates[1].refresh.mockClear();
    useResourceStates[2].refresh.mockClear();

    const { container } = render(<AdsResearchPageClient />);

    expect(
      screen.getByRole('heading', { name: 'Ads Intelligence' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Public Winners')).toBeInTheDocument();
    expect(screen.getByText('Connected Ads')).toBeInTheDocument();
    expect(screen.getByText('Launch policy')).toBeInTheDocument();
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
});
