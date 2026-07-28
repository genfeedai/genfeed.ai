import {
  CredentialPlatform,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
} from '@genfeedai/enums';
import type { IReleaseGroup } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ReleaseAnalyticsOverlay from './release-analytics-overlay';

vi.mock('@ui/primitives/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => children,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

function release(state: IReleaseGroup['analyticsComparison']['state']) {
  return {
    analyticsComparison: {
      metricDefinitions: [
        'views',
        'likes',
        'comments',
        'shares',
        'saves',
        'engagementRate',
      ],
      releaseId: 'release-1',
      state,
      targets: [
        {
          collection: {
            capability: TargetAnalyticsCapability.SUPPORTED,
            error:
              state === 'error'
                ? {
                    code: 'provider_timeout',
                    failedAt: '2026-07-27T10:00:00.000Z',
                    isRetryable: true,
                    message: 'Provider timed out.',
                  }
                : null,
            freshness:
              state === 'stale'
                ? TargetAnalyticsFreshness.STALE
                : TargetAnalyticsFreshness.FRESH,
            lastCollectedAt: '2026-07-27T10:00:00.000Z',
            requestedAt: '2026-07-27T09:59:00.000Z',
            state:
              state === 'error'
                ? TargetAnalyticsCollectionState.FAILED
                : TargetAnalyticsCollectionState.READY,
          },
          metrics:
            state === 'error'
              ? null
              : {
                  comments: 3,
                  engagementRate: 0.14,
                  likes: 12,
                  saves: 2,
                  shares: 4,
                  views: 100,
                },
          platform: CredentialPlatform.INSTAGRAM,
          releaseId: 'release-1',
          snapshotIdentity:
            state === 'error'
              ? null
              : {
                  snapshotDate: '2026-07-27',
                  updatedAt: '2026-07-27T10:00:00.000Z',
                },
          targetId: 'target-1',
        },
      ],
    },
    id: 'release-1',
    title: 'Campaign release',
  } as IReleaseGroup;
}

describe('ReleaseAnalyticsOverlay', () => {
  it.each([
    'ready',
    'mixed',
    'stale',
  ] as const)('renders named target metrics for the %s state', (state) => {
    render(
      <ReleaseAnalyticsOverlay release={release(state)} onClose={vi.fn()} />,
    );

    expect(
      screen.getByRole('table', {
        name: 'Normalized analytics metrics by release target',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('14%')).toBeInTheDocument();
    expect(screen.getAllByText(state).length).toBeGreaterThan(0);
  });

  it('surfaces a sanitized collection error without inventing metrics', () => {
    render(
      <ReleaseAnalyticsOverlay release={release('error')} onClose={vi.fn()} />,
    );

    expect(screen.getAllByText('Unavailable')).toHaveLength(6);
    expect(screen.getByText('Provider timed out.')).toBeInTheDocument();
  });

  it('renders the explicit empty state when no targets exist', () => {
    const emptyRelease = release('empty');
    emptyRelease.analyticsComparison.targets = [];

    render(
      <ReleaseAnalyticsOverlay release={emptyRelease} onClose={vi.fn()} />,
    );

    expect(screen.getByText('No target analytics yet')).toBeInTheDocument();
  });
});
