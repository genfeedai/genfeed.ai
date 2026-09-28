import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import AgentActivitySection from './AgentActivitySection';

vi.mock('@genfeedai/agent/components/AgentActivityFeed', () => ({
  AgentActivityFeed: () => <div data-testid="agent-activity-feed" />,
}));

vi.mock('./AgentWorkSection', () => ({
  default: () => <div data-testid="agent-work-section" />,
}));

vi.mock('./AgentPerformanceSection', () => ({
  default: () => <div data-testid="agent-performance-section" />,
}));

// `WorkflowExecutionHistorySection` renders for real: it is the only place
// left that shows the routed-model metadata (mixed actual/requested model),
// and this suite is what proves that regression coverage survived the merge
// into one Activity section (#5483).
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      activity: 'Activity',
      activityFilterAll: 'All activity',
      activityFilterAria: 'Filter activity',
      activityFilterContent: 'Content',
      activityFilterReports: 'Reports',
      activityFilterRuns: 'Runs',
      columnCredits: 'Credits',
      columnDuration: 'Duration',
      columnModel: 'Model',
      columnNodes: 'Nodes',
      columnStarted: 'Started',
      columnStatus: 'Status',
      empty: 'No executions yet',
      historyTitle: 'Run history',
    })[key] ?? key,
}));

const baseProps = {
  agentId: 'agent-1',
  executions: [] as IWorkflowExecution[],
  executionsErrorMessage: 'Could not load agent executions.',
  expandedExecutionId: null,
  getExecutionHref: (id: string) => `/runs/${id}`,
  getThreadHref: (id: string) => `/agent/${id}`,
  isExecutionsError: false,
  isExecutionsLoading: false,
  onToggleExpandExecution: vi.fn(),
  runHistory: [],
};

describe('AgentActivitySection', () => {
  beforeEach(() => {
    // Radix Select's pointer-based open/close needs APIs jsdom does not
    // implement.
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it('renders exactly one filter control governing every sub-section', () => {
    render(<AgentActivitySection {...baseProps} />);

    expect(
      screen.getAllByRole('combobox', { name: 'Filter activity' }),
    ).toHaveLength(1);
    expect(screen.getByTestId('agent-work-section')).toBeInTheDocument();
    expect(screen.getByTestId('agent-performance-section')).toBeInTheDocument();
    expect(screen.getByTestId('agent-activity-feed')).toBeInTheDocument();
    expect(screen.getByText('Run history')).toBeInTheDocument();
  });

  it('shows only the content section when filtered to Content', async () => {
    const user = userEvent.setup();
    render(<AgentActivitySection {...baseProps} />);

    await user.click(screen.getByRole('combobox', { name: 'Filter activity' }));
    await user.click(screen.getByRole('option', { name: 'Content' }));

    expect(screen.getByTestId('agent-work-section')).toBeInTheDocument();
    expect(
      screen.queryByTestId('agent-performance-section'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-activity-feed')).not.toBeInTheDocument();
  });

  it('shows only the runs section when filtered to Runs', async () => {
    const user = userEvent.setup();
    render(<AgentActivitySection {...baseProps} />);

    await user.click(screen.getByRole('combobox', { name: 'Filter activity' }));
    await user.click(screen.getByRole('option', { name: 'Runs' }));

    expect(screen.queryByTestId('agent-work-section')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('agent-performance-section'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-activity-feed')).toBeInTheDocument();
    expect(screen.getByText('Run history')).toBeInTheDocument();
  });

  it('shows the executions error message instead of the runs table when runs fail', async () => {
    const user = userEvent.setup();
    render(<AgentActivitySection {...baseProps} isExecutionsError />);

    await user.click(screen.getByRole('combobox', { name: 'Filter activity' }));
    await user.click(screen.getByRole('option', { name: 'Runs' }));

    expect(
      screen.getByText('Could not load agent executions.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Run history')).not.toBeInTheDocument();
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
