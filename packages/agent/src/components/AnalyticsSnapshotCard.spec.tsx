import { AnalyticsSnapshotCard } from '@genfeedai/agent/components/AnalyticsSnapshotCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) =>
      `/acme/~${path.startsWith('/') ? path : `/${path}`}`,
  }),
}));

describe('AnalyticsSnapshotCard', () => {
  it('renders normalized metrics items from the server', () => {
    const action: AgentUiAction = {
      id: 'analytics-card-1',
      metrics: {
        items: [
          { change: 14.2, label: 'Views', value: 4200 },
          { label: 'Posts', value: 12 },
          { decimals: 1, label: 'Avg engagement', suffix: '%', value: 4.3 },
        ],
      },
      title: 'Analytics summary (30d)',
      type: 'analytics_snapshot_card',
    };

    render(<AnalyticsSnapshotCard action={action} />);

    expect(screen.getByText('Views')).toBeTruthy();
    expect(screen.getByText('4.2K')).toBeTruthy();
    expect(screen.getByText('Posts')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Avg engagement')).toBeTruthy();
    expect(screen.getByText('4.3%')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open analytics' }),
    ).toHaveAttribute('href', '/acme/~/analytics/overview');
  });

  it('toggles between period snapshots without rendering two cards', async () => {
    const user = userEvent.setup();
    const action: AgentUiAction = {
      data: {
        period: '30d',
        periodSnapshots: [
          {
            metrics: { items: [{ label: 'Views', value: 10 }] },
            period: '7d',
            title: 'Analytics summary (7d)',
          },
          {
            metrics: { items: [{ label: 'Views', value: 99 }] },
            period: '30d',
            title: 'Analytics summary (30d)',
          },
        ],
      },
      id: 'analytics-snapshot:org:merged',
      metrics: { items: [{ label: 'Views', value: 99 }] },
      title: 'Analytics summary',
      type: 'analytics_snapshot_card',
    };

    render(<AnalyticsSnapshotCard action={action} />);

    expect(screen.getByRole('tab', { name: '7d' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '30d' })).toBeTruthy();
    expect(screen.getByText('99')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: '7d' }));
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('collapses the metric grid into a compact preview strip', () => {
    const action: AgentUiAction = {
      id: 'analytics-card-2',
      metrics: {
        items: [
          { decimals: 1, label: 'Replies / hour', value: 3.4 },
          { decimals: 1, label: 'Success rate', suffix: '%', value: 48.9 },
        ],
      },
      title: 'Campaign analytics snapshot',
      type: 'analytics_snapshot_card',
    };

    render(<AnalyticsSnapshotCard action={action} />);

    expect(screen.getByText('Replies / hour')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open analytics' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse analytics' }));

    // Collapsing swaps the detail grid for a label + value preview strip — the
    // metrics stay readable, only the expanded card body goes away.
    expect(screen.queryByRole('link', { name: 'Open analytics' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Expand analytics' }),
    ).toBeTruthy();
    expect(screen.getByText('Replies / hour')).toBeTruthy();
    expect(screen.getByText('3.4')).toBeTruthy();
    expect(screen.getByText('Success rate')).toBeTruthy();
    expect(screen.getByText('48.9%')).toBeTruthy();
  });
});
