import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import AgentActivitySection from './AgentActivitySection';

const mocks = vi.hoisted(() => ({
  posts: {
    isError: false,
    isLoading: false,
    posts: [] as Array<Record<string, unknown>>,
  },
  performance: {
    isReportsError: false,
    isReportsLoading: false,
    isSnapshotError: false,
    isSnapshotLoading: false,
    reports: [] as Array<Record<string, unknown>>,
    snapshot: undefined as Record<string, unknown> | undefined,
  },
}));

vi.mock('./use-agent-detail-posts', () => ({
  useAgentDetailPosts: () => mocks.posts,
}));

vi.mock('./use-agent-performance', () => ({
  useAgentPerformance: () => mocks.performance,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    ({
      activate: 'Activate',
      activity: 'Activity',
      activityDailyReport: 'Daily report',
      activityEmpty: 'No activity yet',
      activityExecution: `Execution — ${values?.status}`,
      activityFilterAll: 'All activity',
      activityFilterAria: 'Filter activity',
      activityFilterContent: 'Content',
      activityFilterReports: 'Reports',
      activityFilterRuns: 'Runs',
      activityLoading: 'Loading activity…',
      activityRunBudgetExhausted: 'Run stopped — budget exhausted',
      activityRunCompleted: 'Run completed',
      activityRunFailed: 'Run failed',
      activityRunGenerated: `${values?.count} generated · ${values?.credits} credits`,
      activityViewAction: 'View',
      activityWeeklyReport: 'Weekly report',
      contentError: 'Could not load agent content.',
      counts: `${values?.generated} generated · ${values?.published} published · ${values?.credits} credits`,
      engagement: `${values?.impressions} impressions · ${values?.clicks} clicks · ${values?.visits} visits`,
      executionsError: 'Could not load agent executions.',
      partialSample: `Partial sample: ${values?.postsSampled} of ${values?.matchedPosts} posts`,
      performanceError: 'Could not load agent performance.',
      platformNotSet: 'Platform not set',
      postMeta: `${values?.platform} · ${values?.state}`,
      postMetaPending: `${values?.platform} · ${values?.state} · Pending review`,
      reportError: 'Could not load daily report.',
      unavailable: 'Unavailable',
      untitledPost: 'Untitled post',
    })[key] ?? key,
}));

const baseProps = {
  agentId: 'agent-1',
  executions: [] as IWorkflowExecution[],
  isExecutionsError: false,
  isExecutionsLoading: false,
  runHistory: [],
};

describe('AgentActivitySection', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();

    mocks.posts = { isError: false, isLoading: false, posts: [] };
    mocks.performance = {
      isReportsError: false,
      isReportsLoading: false,
      isSnapshotError: false,
      isSnapshotLoading: false,
      reports: [],
      snapshot: undefined,
    };
  });

  it('renders exactly one filter control governing the whole merged feed', () => {
    render(<AgentActivitySection {...baseProps} />);

    expect(
      screen.getAllByRole('combobox', { name: 'Filter activity' }),
    ).toHaveLength(1);
  });

  it('merges content, reports and runs into one feed sorted newest first', () => {
    mocks.posts = {
      isError: false,
      isLoading: false,
      posts: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'post-1',
          label: 'Oldest post',
          status: 'draft',
          targetExecutionState: 'published',
        },
      ],
    };
    mocks.performance = {
      isReportsError: false,
      isReportsLoading: false,
      isSnapshotError: false,
      isSnapshotLoading: false,
      reports: [
        {
          allocationChanges: [],
          creditsSpent: 1,
          generatedCount: 1,
          id: 'report-1',
          periodEnd: '2026-01-03T00:00:00.000Z',
          periodStart: '2026-01-02T00:00:00.000Z',
          publishedCount: 1,
          reportType: 'daily',
        },
      ],
      snapshot: undefined,
    };

    render(
      <AgentActivitySection
        {...baseProps}
        runHistory={[
          {
            completedAt: '2026-01-02T00:05:00.000Z',
            contentGenerated: 1,
            creditsUsed: 2,
            startedAt: '2026-01-02T00:00:00.000Z',
            status: 'completed',
          },
        ]}
      />,
    );

    // Newest first: the report (Jan 3) precedes the run (Jan 2), which
    // precedes the post (Jan 1) — verified by DOM order since ListRow
    // titles are plain text, not headings.
    const titles = ['Daily report', 'Run completed', 'Oldest post'];
    const positions = titles.map((title) => screen.getByText(title));
    for (let index = 0; index < positions.length - 1; index += 1) {
      expect(
        positions[index].compareDocumentPosition(positions[index + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('narrows the feed to Content only', async () => {
    const user = userEvent.setup();
    mocks.posts = {
      isError: false,
      isLoading: false,
      posts: [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'post-1',
          label: 'A post',
          status: 'draft',
          targetExecutionState: 'published',
        },
      ],
    };

    render(
      <AgentActivitySection
        {...baseProps}
        runHistory={[
          {
            completedAt: '2026-01-02T00:05:00.000Z',
            contentGenerated: 1,
            creditsUsed: 2,
            startedAt: '2026-01-02T00:00:00.000Z',
            status: 'completed',
          },
        ]}
      />,
    );

    expect(screen.getByText('A post')).toBeInTheDocument();
    expect(screen.getByText('Run completed')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Filter activity' }));
    await user.click(screen.getByRole('option', { name: 'Content' }));

    expect(screen.getByText('A post')).toBeInTheDocument();
    expect(screen.queryByText('Run completed')).not.toBeInTheDocument();
  });

  it('shows the empty state when every source has resolved with nothing', () => {
    render(<AgentActivitySection {...baseProps} />);

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });

  it('shows a loading state instead of the empty state while a relevant source is still loading', () => {
    mocks.posts = { isError: false, isLoading: true, posts: [] };

    render(<AgentActivitySection {...baseProps} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading activity…');
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
  });

  it('warns when the performance metrics are a truncated sample', () => {
    mocks.performance = {
      ...mocks.performance,
      snapshot: {
        clicks: 0,
        creditsSpent: 1,
        generatedCount: 300,
        impressions: 0,
        publishedCount: 280,
        sampling: {
          matchedMeasurements: 900,
          matchedPosts: 300,
          measurementsSampled: 250,
          postsSampled: 250,
          truncated: true,
        },
      },
    };

    render(<AgentActivitySection {...baseProps} />);

    expect(
      screen.getByText('Partial sample: 250 of 300 posts'),
    ).toBeInTheDocument();
  });

  it('keeps each source error visible inside the merged view', () => {
    mocks.posts = { isError: true, isLoading: false, posts: [] };
    mocks.performance = {
      isReportsError: true,
      isReportsLoading: false,
      isSnapshotError: false,
      isSnapshotLoading: false,
      reports: [],
      snapshot: undefined,
    };

    render(<AgentActivitySection {...baseProps} isExecutionsError />);

    expect(
      screen.getByText('Could not load agent content.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Could not load daily report.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Could not load agent executions.'),
    ).toBeInTheDocument();
  });

  it('still surfaces routed model metadata for a mixed actual/requested execution', () => {
    const executions = [
      {
        completedAt: '2026-03-26T10:15:00.000Z',
        createdAt: '2026-03-26T10:00:00.000Z',
        creditsUsed: 6,
        durationMs: 18000,
        id: 'execution-1',
        metadata: {
          actualModel: 'google/gemini-2.5-flash',
          requestedModel: 'openai/gpt-5.6-terra',
        },
        nodeResults: [],
        organizationId: 'org-1',
        startedAt: '2026-03-26T10:01:00.000Z',
        status: 'COMPLETED',
        updatedAt: '2026-03-26T10:15:00.000Z',
      },
    ] as unknown as IWorkflowExecution[];

    render(<AgentActivitySection {...baseProps} executions={executions} />);

    expect(
      screen.getByText('google/gemini-2.5-flash via openai/gpt-5.6-terra'),
    ).toBeInTheDocument();
  });
});
