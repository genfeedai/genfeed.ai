import type { TrendCorpusFreshnessHealth } from '@props/trends/trends-page.props';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import CorpusHealthPanel from './corpus-health-panel';

const emptyHealth: TrendCorpusFreshnessHealth = {
  generatedAt: '2026-09-05T10:00:00Z',
  providerFailures: [],
  segments: [],
  status: 'empty',
  summary: {
    activeTrends: 0,
    failingProviders: 0,
    freshSegments: 0,
    platforms: [],
    referenceRecords: 0,
    staleSegments: 0,
    totalSegments: 0,
  },
};

describe('CorpusHealthPanel', () => {
  it('shows unavailable platform coverage for an empty corpus, never healthy zero', () => {
    render(<CorpusHealthPanel health={emptyHealth} />);
    expect(
      screen.getByRole('region', { name: 'Source health' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Trend corpus empty')).toBeInTheDocument();
    for (const name of ['X / Twitter', 'Reddit', 'TikTok']) {
      expect(
        within(screen.getByRole('group', { name })).getByText(
          'Health unavailable',
        ),
      ).toBeInTheDocument();
    }
    expect(screen.queryByText('healthy')).not.toBeInTheDocument();
    expect(
      screen.getAllByText('Last successful refresh: Not recorded'),
    ).toHaveLength(3);
    expect(screen.getAllByText('Last attempt: Not recorded')).toHaveLength(3);
  });

  it('scopes health to selected platforms and honestly labels stale observations', () => {
    render(
      <CorpusHealthPanel
        health={{
          ...emptyHealth,
          status: 'stale',
          segments: [
            {
              id: 'one',
              platform: 'reddit',
              provider: 'apify',
              status: 'stale',
              latestSeenAt: '2026-09-01T09:00:00Z',
            },
          ],
        }}
        selectedPlatforms={['reddit']}
      />,
    );
    expect(
      screen.queryByRole('group', { name: 'X / Twitter' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('apify: stale')).toBeInTheDocument();
    expect(
      screen.getByText(/Last observed source timestamp:/),
    ).toHaveTextContent('2026-09-01T09:00:00Z');
    expect(
      screen.getByText('Last successful refresh: Not recorded'),
    ).toBeInTheDocument();
  });

  it('includes observed platforms and fixed degraded reason copy without raw provider errors', () => {
    render(
      <CorpusHealthPanel
        health={{
          ...emptyHealth,
          status: 'degraded',
          providerFailures: [
            {
              platform: 'youtube',
              provider: 'native-api',
              reason: 'fallback_source_preview',
              message: 'secret raw provider error',
              retryAction: 'secret action',
              affectedTrendCount: 2,
              severity: 'warning',
              latestObservedAt: '2026-09-05T08:00:00Z',
            },
          ],
        }}
      />,
    );
    const youtube = within(screen.getByRole('group', { name: 'youtube' }));
    expect(
      youtube.getByText(/native-api: Saved fallback previews/),
    ).toBeInTheDocument();
    expect(youtube.getByText(/Last preview observation:/)).toHaveTextContent(
      '2026-09-05T08:00:00Z',
    );
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  });

  it('marks the health request unavailable even if a previous snapshot is cached', () => {
    render(
      <CorpusHealthPanel
        health={{ ...emptyHealth, status: 'healthy' }}
        isUnavailable
      />,
    );
    expect(screen.getByText('Trend corpus unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(/Previously loaded health may be outdated/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Trend corpus healthy')).not.toBeInTheDocument();
  });
  it('does not call a selected missing platform healthy because another platform is healthy', () => {
    render(
      <CorpusHealthPanel
        health={{
          ...emptyHealth,
          status: 'healthy',
          segments: [
            {
              id: 'tiktok',
              platform: 'tiktok',
              provider: 'apify',
              status: 'healthy',
            },
          ],
        }}
        selectedPlatforms={['twitter']}
      />,
    );
    expect(screen.getByText('Trend corpus unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Trend corpus healthy')).not.toBeInTheDocument();
    expect(
      screen.getByText(/No saved health is available for this platform/),
    ).toBeInTheDocument();
  });

  it('shows checking while the first health response is pending', () => {
    render(<CorpusHealthPanel />);
    expect(screen.getByText('Checking trend corpus')).toBeInTheDocument();
    expect(screen.getAllByText('Checking health')).toHaveLength(3);
    expect(screen.queryByText('Health unavailable')).not.toBeInTheDocument();
  });
});
