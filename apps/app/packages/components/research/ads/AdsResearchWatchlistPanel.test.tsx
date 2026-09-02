import type {
  AdWatchedAdvertiser,
  AdWatchlistPlatformReadiness,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdsResearchWatchlistPanel } from './AdsResearchWatchlistPanel';
import '@testing-library/jest-dom/vitest';

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    disabled,
    onClick,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children?: ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <div data-testid="select" data-value={value}>
      <button onClick={() => onValueChange?.('youtube')} type="button">
        Choose YouTube
      </button>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const readiness: AdWatchlistPlatformReadiness[] = [
  {
    available: true,
    blockers: [],
    documentationUrl: 'https://www.facebook.com/ads/library/',
    platform: 'meta',
    provider: 'meta_ad_library',
    status: 'available',
  },
  {
    available: false,
    blockers: ['google_ads_transparency_contract_fixtures_missing'],
    documentationUrl: 'https://adstransparency.google.com/',
    platform: 'google',
    provider: 'google_ads_transparency_center',
    status: 'unavailable',
  },
  {
    available: false,
    blockers: ['x_ads_repository_entitlement_not_confirmed'],
    documentationUrl: 'https://ads.x.com/ads-repository',
    platform: 'x',
    provider: 'x_ads_repository',
    status: 'unavailable',
  },
];

const advertisers: AdWatchedAdvertiser[] = [
  {
    advertiserHandle: 'nike',
    advertiserName: 'Nike',
    freshnessState: 'fresh',
    id: 'watched-1',
    lastSnapshotRecordCount: 12,
    lastSuccessfulAt: '2026-08-24T10:00:00.000Z',
    platform: 'meta',
  },
  {
    advertiserHandle: 'adidas',
    freshnessState: 'unavailable',
    id: 'watched-2',
    lastAttemptedAt: '2026-08-24T09:00:00.000Z',
    lastIngestionErrorCode: 'paid_creative_apify_token_missing',
    platform: 'tiktok',
  },
];

function renderPanel(
  overrides: Partial<Parameters<typeof AdsResearchWatchlistPanel>[0]> = {},
) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();

  render(
    <AdsResearchWatchlistPanel
      advertisers={advertisers}
      isAdding={false}
      isLoading={false}
      readiness={readiness}
      onAdd={onAdd}
      onRemove={onRemove}
      {...overrides}
    />,
  );

  return { onAdd, onRemove };
}

describe('AdsResearchWatchlistPanel', () => {
  it('watches a competitor on the platform the operator picked (#3537)', () => {
    const { onAdd } = renderPanel();

    fireEvent.change(screen.getByLabelText('Advertiser handle'), {
      target: { value: '@allbirds' },
    });
    fireEvent.click(screen.getByText('Choose YouTube'));
    fireEvent.click(screen.getByText('Watch competitor'));

    expect(onAdd).toHaveBeenCalledWith({
      advertiserHandle: '@allbirds',
      platform: 'youtube',
    });
  });

  it('names the archives it cannot poll instead of showing an empty list (#3537)', () => {
    renderPanel();

    expect(screen.getByText('Archives we cannot poll yet')).toBeInTheDocument();
    expect(screen.getByText(/Google publishes no ad API/)).toBeInTheDocument();
    expect(
      screen.getByText(/no confirmed X Ads Repository entitlement/),
    ).toBeInTheDocument();
  });

  it('surfaces the ingestion error that starved a watched competitor (#3537)', () => {
    renderPanel();

    expect(screen.getByText('Nike')).toBeInTheDocument();
    expect(screen.getByText('12 creatives')).toBeInTheDocument();
    expect(screen.getByText('Not polled')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The archive scraper credential is not configured on this deployment.',
      ),
    ).toBeInTheDocument();
  });

  it('uses the singular label for one captured creative (#3537)', () => {
    renderPanel({
      advertisers: advertisers.map((advertiser) =>
        advertiser.id === 'watched-1'
          ? { ...advertiser, lastSnapshotRecordCount: 1 }
          : advertiser,
      ),
    });

    expect(screen.getByText('1 creative')).toBeInTheDocument();
  });

  it('falls back to the raw blocker code when it has no wording yet (#3537)', () => {
    renderPanel({
      readiness: [
        {
          available: false,
          blockers: ['some_unmapped_future_blocker'],
          documentationUrl: 'https://example.com/',
          platform: 'tiktok',
          provider: 'tiktok_creative_center',
          status: 'unavailable',
        },
      ],
    });

    expect(
      screen.getByText(/some_unmapped_future_blocker/),
    ).toBeInTheDocument();
  });

  it('stops watching a competitor by id (#3537)', () => {
    const { onRemove } = renderPanel();

    fireEvent.click(screen.getByLabelText('Stop watching adidas'));

    expect(onRemove).toHaveBeenCalledWith('watched-2');
  });

  it('disables the row action while its removal is in flight (#3537)', () => {
    renderPanel({ busyId: 'watched-1' });

    expect(screen.getByLabelText('Stop watching nike')).toBeDisabled();
    expect(screen.getByLabelText('Stop watching adidas')).not.toBeDisabled();
  });

  it('reports why nothing loaded rather than reading as no competitors (#3537)', () => {
    renderPanel({
      advertisers: [],
      loadError: 'Request failed with status 500',
    });

    expect(
      screen.getByText('Request failed with status 500'),
    ).toBeInTheDocument();
  });
});
