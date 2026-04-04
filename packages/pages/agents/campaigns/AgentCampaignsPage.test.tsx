import AgentCampaignsPage from '@pages/agents/campaigns/AgentCampaignsPage';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const mockCampaigns = [
  {
    agents: ['agent-1', 'agent-2'],
    brief: 'Launch sequence',
    creditsAllocated: 1000,
    creditsUsed: 320,
    id: 'campaign-1',
    label: 'Spring Launch',
    nextOrchestratedAt: '2026-04-03T12:00:00Z',
    orchestrationEnabled: true,
    orchestrationIntervalHours: 12,
    startDate: '2026-03-31',
    status: 'active' as const,
  },
  {
    agents: ['agent-3'],
    brief: 'Draft campaign',
    creditsAllocated: 500,
    creditsUsed: 0,
    id: 'campaign-2',
    label: 'Summer Draft',
    orchestrationEnabled: false,
    orchestrationIntervalHours: 24,
    startDate: '2026-05-01',
    status: 'draft' as const,
  },
];

const mockUseAgentCampaigns = vi.fn(() => ({
  campaigns: mockCampaigns,
  isLoading: false,
  refresh: vi.fn(),
}));

vi.mock('@hooks/data/agent-campaigns/use-agent-campaigns', () => ({
  useAgentCampaigns: () => mockUseAgentCampaigns(),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock('@helpers/formatting/cn/cn.util', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    label,
    right,
  }: {
    children: ReactNode;
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      {right}
      {children}
    </section>
  ),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    bodyClassName,
  }: {
    children: ReactNode;
    bodyClassName?: string;
    className?: string;
    label?: string;
    headerAction?: ReactNode;
  }) => <div data-body-class={bodyClassName}>{children}</div>,
}));

vi.mock('@ui/navigation/link/Link', () => ({
  default: ({
    label,
    url,
  }: {
    label: ReactNode;
    url: string;
    variant?: string;
    size?: string;
    icon?: ReactNode;
    className?: string;
  }) => <a href={url}>{label}</a>,
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    items,
    columns,
  }: {
    items: Array<{ id: string; label: string }>;
    columns: Array<{
      header: string;
      key: string;
      render: (item: Record<string, unknown>) => ReactNode;
    }>;
    isLoading?: boolean;
    getRowKey?: (item: Record<string, unknown>) => string;
    emptyLabel?: string;
  }) => (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            {columns.map((col) => (
              <td key={col.key}>
                {col.render(item as unknown as Record<string, unknown>)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

describe('AgentCampaignsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: mockCampaigns,
      isLoading: false,
      refresh: vi.fn(),
    });
  });

  it('renders the page header and new campaign link', () => {
    render(<AgentCampaignsPage />);

    expect(screen.getByText('Agent Campaigns')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new campaign/i })).toHaveAttribute(
      'href',
      '/orchestration/campaigns/new',
    );
  });

  it('renders the KPI stats strip', () => {
    render(<AgentCampaignsPage />);

    const statsStrip = screen.getByTestId('campaign-stats-strip');
    expect(statsStrip).toBeInTheDocument();
    expect(screen.getByText('Total Credits Used')).toBeInTheDocument();
    expect(screen.getByText('Credits Allocated')).toBeInTheDocument();
    expect(screen.getByText('Next Orchestration')).toBeInTheDocument();
  });

  it('renders active campaign cards', () => {
    render(<AgentCampaignsPage />);

    const cardsSection = screen.getByTestId('campaign-active-cards');
    expect(cardsSection).toBeInTheDocument();
    expect(screen.getAllByText('Spring Launch').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('renders the campaign table with orchestration and progress columns', () => {
    render(<AgentCampaignsPage />);

    expect(screen.getByTestId('campaign-table')).toBeInTheDocument();
    expect(screen.getByText('Orchestration')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Every 12h')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('shows empty state when no campaigns', () => {
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: [],
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<AgentCampaignsPage />);

    expect(screen.getByText('No campaigns yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create your first multi-agent campaign to coordinate content production.',
      ),
    ).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: [],
      isLoading: true,
      refresh: vi.fn(),
    });

    render(<AgentCampaignsPage />);

    expect(screen.getByText('Loading campaigns...')).toBeInTheDocument();
  });
});
