import type { TrendCorpusFreshnessHealth } from '@props/trends/trends-page.props';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import CorpusHealthPanel from './corpus-health-panel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

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
  const successful = {
    platform: 'tiktok',
    dataset: 'videos' as const,
    scope: 'global' as const,
    outcome: 'fallback_available' as const,
    reason: null,
    completedAt: '2026-10-08T12:00:00Z',
    lastAttemptAt: '2026-10-08T11:59:00Z',
    lastSuccessfulRefreshAt: '2026-10-08T12:00:00Z',
  };
  it('never labels an unrecorded empty corpus healthy', () => {
    render(
      <CorpusHealthPanel health={emptyHealth} selectedPlatforms={['tiktok']} />,
    );
    expect(
      screen.getByRole('region', { name: 'Source health' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No collection recorded')).toBeInTheDocument();
    expect(screen.getByText('tiktok · not recorded')).toBeInTheDocument();
    expect(screen.queryByText(/healthy/)).not.toBeInTheDocument();
  });
  it('keeps account failures out of global market health and shows collection without requiring preview references', () => {
    render(
      <CorpusHealthPanel
        scope="global"
        health={{
          ...emptyHealth,
          refreshHealth: [
            successful,
            {
              ...successful,
              scope: 'scoped',
              dataset: 'trends',
              outcome: 'native_failed',
              reason: 'authentication_required',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('tiktok · available')).toBeInTheDocument();
    expect(screen.getByText('Collection recorded')).toBeInTheDocument();
    expect(screen.queryByText(/Reconnect/)).not.toBeInTheDocument();
    expect(screen.getByText(/2026-10-08 12:00 UTC/)).toBeInTheDocument();
  });
  it('keeps a successful video dataset distinct from a failed sound dataset', () => {
    render(
      <CorpusHealthPanel
        health={{
          ...emptyHealth,
          refreshHealth: [
            successful,
            {
              ...successful,
              dataset: 'sounds',
              outcome: 'fallback_failed',
              reason: 'budget_exhausted',
              lastSuccessfulRefreshAt: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('tiktok · degraded')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/Provider credits/)).toBeInTheDocument();
  });
  it('filters receipt details as well as platform badges', () => {
    render(
      <CorpusHealthPanel
        selectedPlatforms={['youtube']}
        health={{
          ...emptyHealth,
          refreshHealth: [successful, { ...successful, platform: 'youtube' }],
        }}
      />,
    );
    expect(screen.queryByText(/tiktok/)).not.toBeInTheDocument();
    expect(screen.getByText('youtube · available')).toBeInTheDocument();
  });
  it('separates preview coverage from provider health and never prints raw errors', () => {
    render(
      <CorpusHealthPanel
        health={{
          ...emptyHealth,
          refreshHealth: [successful],
          providerFailures: [
            {
              platform: 'tiktok',
              provider: 'apify',
              reason: 'fallback_source_preview',
              message: 'secret raw provider error',
              retryAction: 'secret action',
              affectedTrendCount: 2,
              severity: 'warning',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Collection recorded')).toBeInTheDocument();
    expect(screen.getByText('Source preview coverage')).toBeInTheDocument();
    expect(
      screen.getByText(/Source previews use fallback data/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  });
});
