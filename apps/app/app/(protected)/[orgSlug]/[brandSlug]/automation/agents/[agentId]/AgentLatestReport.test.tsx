import type { AgentStrategyReport } from '@services/automation/agent-strategies.service';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import AgentLatestReport from './AgentLatestReport';

const mocks = vi.hoisted(() => ({
  performance: {
    isReportsError: false,
    isReportsLoading: false,
    isSnapshotError: false,
    isSnapshotLoading: false,
    reports: [] as AgentStrategyReport[],
    snapshot: undefined,
  },
}));

vi.mock('./use-agent-performance', () => ({
  useAgentPerformance: () => mocks.performance,
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ value }: { value: string }) => <span>{value}</span>,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    ({
      activityDailyReport: 'Daily report',
      activityWeeklyReport: 'Weekly report',
      counts: `${values?.generated} generated · ${values?.published} published · ${values?.credits} credits`,
      latestReport: 'Latest report',
      loadingReport: 'Loading the latest report…',
      noRecommendations: 'No allocation recommendations yet.',
      noReport: 'No report yet.',
      recommendations: 'Recommendations',
      reportError: 'Could not load daily report.',
      topHooks: `Top hooks: ${values?.hooks}`,
      topTopics: `Top topics: ${values?.topics}`,
    })[key] ?? key,
}));

function buildReport(
  overrides: Partial<AgentStrategyReport> = {},
): AgentStrategyReport {
  return {
    allocationChanges: [],
    bestPlatformFormatPairs: [],
    bestPostingWindows: [],
    clicks: 0,
    costPerVisit: null,
    creditsSpent: 4,
    ctr: 0,
    generatedCount: 3,
    id: 'agent-run:execution-1',
    impressions: 0,
    periodEnd: '2026-10-18T09:00:00.000Z',
    periodStart: '2026-10-18T00:00:00.000Z',
    publishedCount: 1,
    reportType: 'daily',
    topHooks: [],
    topTopics: [],
    visits: null,
    ...overrides,
  };
}

describe('AgentLatestReport', () => {
  beforeEach(() => {
    mocks.performance.isReportsError = false;
    mocks.performance.isReportsLoading = false;
    mocks.performance.reports = [];
  });

  it('shows the newest report summary, counts and recommendations', () => {
    mocks.performance.reports = [
      buildReport({
        allocationChanges: ['Bias next runs toward linkedin/post.'],
        summary: '3 posts created; 1 published; 2 waiting for review.',
        topTopics: ['pricing', 'launch'],
      }),
      buildReport({ id: 'older', summary: 'Older run summary.' }),
    ];

    render(<AgentLatestReport agentId="agent-1" />);

    expect(
      screen.getByRole('heading', { name: 'Latest report' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('3 posts created; 1 published; 2 waiting for review.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('3 generated · 1 published · 4 credits'),
    ).toBeInTheDocument();
    expect(screen.getByText('Top topics: pricing, launch')).toBeInTheDocument();
    expect(
      screen.getByText('Bias next runs toward linkedin/post.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Older run summary.')).not.toBeInTheDocument();
  });

  it('says when the report has no recommendations', () => {
    mocks.performance.reports = [buildReport({ reportType: 'weekly' })];

    render(<AgentLatestReport agentId="agent-1" />);

    expect(screen.getByText(/Weekly report/)).toBeInTheDocument();
    expect(
      screen.getByText('No allocation recommendations yet.'),
    ).toBeInTheDocument();
  });

  it('shows an empty state before the first report', () => {
    render(<AgentLatestReport agentId="agent-1" />);

    expect(screen.getByText('No report yet.')).toBeInTheDocument();
  });

  it('shows a loading state while reports load', () => {
    mocks.performance.isReportsLoading = true;

    render(<AgentLatestReport agentId="agent-1" />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading the latest report…',
    );
  });

  it('shows the report error instead of an empty state', () => {
    mocks.performance.isReportsError = true;

    render(<AgentLatestReport agentId="agent-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load daily report.',
    );
    expect(screen.queryByText('No report yet.')).not.toBeInTheDocument();
  });
});
