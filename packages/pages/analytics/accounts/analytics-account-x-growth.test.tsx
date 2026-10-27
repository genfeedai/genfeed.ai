import type { IXGrowthReport } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsAccountXGrowth from './analytics-account-x-growth';

const mocks = vi.hoisted(() => ({ getXGrowthReport: vi.fn() }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({
    dateRange: { endDate: '2026-10-07', startDate: '2026-10-01' },
    refreshTrigger: 0,
  }),
}));

const getService = async () => ({
  getXGrowthReport: mocks.getXGrowthReport,
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

const observed = (value: number) => ({ availability: 'observed', value });

function report(overrides: Partial<IXGrowthReport> = {}): IXGrowthReport {
  return {
    activity: {
      isTruncated: false,
      rows: [
        {
          approval: { decision: 'APPROVED' },
          collectionMessage: null,
          collectionState: 'ready',
          externalId: 'x-1',
          isStale: false,
          kind: 'quote',
          metricState: 'observed',
          metrics: { views: observed(120) },
          postId: 'post-1',
          publishedAt: '2026-10-03T10:00:00.000Z',
          sampleUpdatedAt: '2026-10-06T10:00:00.000Z',
          sendReceipt: {
            externalId: 'x-1',
            publishedAt: '2026-10-03T10:00:00.000Z',
            url: 'https://x.com/acct/status/1',
          },
          text: 'Quote of the week',
          url: 'https://x.com/acct/status/1',
        },
        {
          approval: null,
          collectionMessage: null,
          collectionState: 'unavailable',
          externalId: null,
          isStale: false,
          kind: 'reply',
          metricState: 'unavailable',
          metrics: null,
          postId: 'post-2',
          publishedAt: '2026-10-04T10:00:00.000Z',
          sampleUpdatedAt: null,
          sendReceipt: null,
          text: 'A reply',
          url: null,
        },
      ],
      summary: {
        byKind: { post: 0, quote: 1, reply: 1, unknown: 0 },
        rowsWithObservedViews: 1,
        rowsWithStaleMetrics: 0,
        totalRows: 2,
        totalViews: 120,
      },
    },
    directConversions: { reason: 'x', state: 'unavailable' },
    generatedAt: '2026-10-27T12:00:00.000Z',
    growth: {
      delta: 50,
      endDate: '2026-10-07',
      endFollowers: 1050,
      maxGapDays: 2,
      observedDays: 4,
      periodDays: 7,
      relationship: 'correlation',
      resets: [],
      startDate: '2026-10-01',
      startFollowers: 1000,
      state: 'observed',
    },
    period: {
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-07T23:59:59.999Z',
    },
    profileTraffic: { reason: 'x', state: 'unavailable' },
    scope: {
      brandId: 'brand-1',
      credentialId: 'cred-1',
      handle: 'acct',
      organizationId: 'org-1',
    },
    scopeKey: 'k',
    ...overrides,
  } as IXGrowthReport;
}

describe('AnalyticsAccountXGrowth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for the exact account, brand and period, and shows the growth with its limits', async () => {
    mocks.getXGrowthReport.mockResolvedValue(report());

    render(<AnalyticsAccountXGrowth brandId="brand-1" credentialId="cred-1" />);

    expect(await screen.findByText('+50 followers')).toBeInTheDocument();
    expect(mocks.getXGrowthReport).toHaveBeenCalledWith('cred-1', {
      brandId: 'brand-1',
      endDate: '2026-10-07',
      startDate: '2026-10-01',
    });
    expect(
      screen.getByText(/does not show that any post or reply caused a follow/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no tracked-link journey is connected/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/X does not report profile clicks/),
    ).toBeInTheDocument();
  });

  it('shows each publication with its type, metric state, approval and send receipt', async () => {
    mocks.getXGrowthReport.mockResolvedValue(report());

    render(<AnalyticsAccountXGrowth brandId="brand-1" credentialId="cred-1" />);

    expect(
      await screen.findByRole('link', { name: 'Quote of the week' }),
    ).toHaveAttribute('href', 'https://x.com/acct/status/1');
    expect(screen.getByText('Quote')).toBeInTheDocument();
    expect(screen.getByText('120 views')).toBeInTheDocument();
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
    // The reply has no metrics, approval or send receipt: each says so.
    expect(screen.getByText('A reply')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('No approval recorded')).toBeInTheDocument();
    expect(screen.getByText('No send receipt')).toBeInTheDocument();
  });

  it('gives a reason, not a number, when there is too little follower data', async () => {
    mocks.getXGrowthReport.mockResolvedValue(
      report({
        growth: {
          observedDays: 1,
          periodDays: 7,
          reason: 'single_snapshot',
          resets: [],
          state: 'insufficient',
        },
      }),
    );

    render(<AnalyticsAccountXGrowth brandId="brand-1" credentialId="cred-1" />);

    expect(await screen.findByText('Not enough data')).toBeInTheDocument();
    expect(
      screen.getByText('Only one follower count was recorded in this period.'),
    ).toBeInTheDocument();
  });

  it('says so when the report cannot be loaded', async () => {
    mocks.getXGrowthReport.mockRejectedValue(new Error('request failed'));

    render(<AnalyticsAccountXGrowth brandId="brand-1" credentialId="cred-1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The X activity report could not be loaded for this period.',
    );
  });
});
