import {
  CredentialPlatform,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
} from '@genfeedai/enums';
import type { IReleaseGroup } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ReleaseAnalyticsTable from './release-analytics-table';

type Comparison = IReleaseGroup['analyticsComparison'];

function comparison(state: Comparison['state']): Comparison {
  const isError = state === 'error';

  return {
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
          error: isError
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
          state: isError
            ? TargetAnalyticsCollectionState.FAILED
            : TargetAnalyticsCollectionState.READY,
        },
        metrics: isError
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
        snapshotIdentity: isError
          ? null
          : {
              snapshotDate: '2026-07-27',
              updatedAt: '2026-07-27T10:00:00.000Z',
            },
        targetId: 'target-1',
      },
    ],
  } as Comparison;
}

describe('ReleaseAnalyticsTable', () => {
  it.each(['ready', 'mixed', 'stale'] as const)(
    'renders named target metrics for the %s state',
    (state) => {
      render(<ReleaseAnalyticsTable comparison={comparison(state)} />);

      expect(
        screen.getByRole('table', {
          name: 'Normalized analytics metrics by channel target',
        }),
      ).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('14%')).toBeInTheDocument();
      // A `ready` row set and a `mixed` one are identical cell-by-cell, so the
      // collection state has to be readable somewhere on the surface itself.
      expect(screen.getAllByText(state).length).toBeGreaterThan(0);
    },
  );

  it('surfaces a sanitized collection error without inventing metrics', () => {
    render(<ReleaseAnalyticsTable comparison={comparison('error')} />);

    expect(screen.getAllByText('Unavailable')).toHaveLength(6);
    expect(screen.getByText('Provider timed out.')).toBeInTheDocument();
  });

  it('renders the explicit empty state when no targets exist', () => {
    const empty = comparison('empty');
    empty.targets = [];

    render(<ReleaseAnalyticsTable comparison={empty} />);

    expect(screen.getByText('No target analytics yet')).toBeInTheDocument();
  });

  it('renders the empty state rather than crashing on an uncollected release', () => {
    render(<ReleaseAnalyticsTable comparison={undefined} />);

    expect(screen.getByText('No target analytics yet')).toBeInTheDocument();
  });
});
