import { AnalyticsSnapshotCard } from '@cloud/agent/components/AnalyticsSnapshotCard';
import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
  });

  it('renders non-post metric labels for campaign snapshots', () => {
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
    expect(screen.getByText('3.4')).toBeTruthy();
    expect(screen.getByText('Success rate')).toBeTruthy();
    expect(screen.getByText('48.9%')).toBeTruthy();
  });
});
