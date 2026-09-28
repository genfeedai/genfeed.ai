import AgentCampaignsPage from '@pages/agents/campaigns/AgentCampaignsPage';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const campaignDefaults = {
  organizationId: 'org-1',
  userId: 'user-1',
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

const mockCampaigns: AgentCampaign[] = [
  {
    ...campaignDefaults,
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
    ...campaignDefaults,
    agents: ['agent-3'],
    brief: 'Draft program',
    creditsAllocated: 500,
    creditsUsed: 0,
    id: 'campaign-2',
    label: 'Summer Draft',
    orchestrationEnabled: false,
    orchestrationIntervalHours: 24,
    startDate: '2026-05-01',
    status: 'draft' as const,
  },
  {
    ...campaignDefaults,
    agents: ['agent-4'],
    brief: 'Paused program',
    creditsAllocated: 800,
    creditsUsed: 200,
    id: 'campaign-3',
    label: 'Autumn Pause',
    orchestrationEnabled: false,
    startDate: '2026-06-01',
    status: 'paused' as const,
  },
  {
    ...campaignDefaults,
    agents: ['agent-5', 'agent-6', 'agent-7'],
    brief: 'Out of credits',
    creditsAllocated: 400,
    creditsUsed: 400,
    id: 'campaign-4',
    label: 'Winter Spend',
    orchestrationEnabled: true,
    startDate: '2026-07-01',
    status: 'active' as const,
  },
];

const mockUseAgentCampaigns = vi.fn(() => ({
  campaigns: mockCampaigns,
  error: null as Error | null,
  isLoading: false,
  refresh: vi.fn(),
}));

const HOUR_MS = 60 * 60 * 1000;

vi.mock('@hooks/data/agent-campaigns/use-agent-campaigns', () => ({
  useAgentCampaigns: () => mockUseAgentCampaigns(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/demo${path}` }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

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
    'data-testid': dataTestId,
  }: {
    children: ReactNode;
    bodyClassName?: string;
    'data-testid'?: string;
  }) => (
    <div data-body-class={bodyClassName} data-testid={dataTestId}>
      {children}
    </div>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

function getRowLabels(section: HTMLElement): string[] {
  return within(section)
    .getAllByTestId('campaign-row')
    .map((row) => row.querySelector('p')?.textContent ?? '');
}

describe('AgentCampaignsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: mockCampaigns,
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });
  });

  it('renders the page header and new program link', () => {
    render(<AgentCampaignsPage />);

    expect(screen.getByText('Programs')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new program/i })).toHaveAttribute(
      'href',
      '/acme/demo/automation/campaigns/new',
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

  it('lists paused and out-of-credit programs in Needs you, above All', () => {
    render(<AgentCampaignsPage />);

    const needsYou = screen.getByTestId('campaign-needs-you');
    const all = screen.getByTestId('campaign-all');

    expect(
      within(needsYou).getByRole('heading', { name: /needs you/i }),
    ).toBeInTheDocument();
    expect(getRowLabels(needsYou)).toEqual(['Autumn Pause', 'Winter Spend']);
    expect(
      needsYou.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Needs-you rows lead with the resolving action.
    expect(
      within(needsYou).getByRole('link', { name: 'Review Autumn Pause' }),
    ).toHaveAttribute('href', '/acme/demo/automation/campaigns/campaign-3');
  });

  it('hides Needs you when no program needs attention', () => {
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: mockCampaigns.slice(0, 2),
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<AgentCampaignsPage />);

    expect(screen.queryByTestId('campaign-needs-you')).toBeNull();
    expect(screen.queryByText('Needs you')).toBeNull();
    expect(screen.getByTestId('campaign-all')).toBeInTheDocument();
  });

  it('shows All as a list by default and switches to a grid', () => {
    render(<AgentCampaignsPage />);

    const all = screen.getByTestId('campaign-all');
    expect(getRowLabels(all)).toEqual([
      'Spring Launch',
      'Summer Draft',
      'Autumn Pause',
      'Winter Spend',
    ]);
    expect(within(all).queryAllByTestId('campaign-card')).toHaveLength(0);
    expect(within(all).getByRole('radio', { name: 'List' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(within(all).getByRole('radio', { name: 'Grid' }));

    expect(within(all).getAllByTestId('campaign-card')).toHaveLength(4);
    expect(within(all).queryAllByTestId('campaign-row')).toHaveLength(0);
    // Program cards cap at three container-query columns.
    const grid = within(all).getByTestId('campaign-collection')
      .firstElementChild as HTMLElement;
    expect(grid.className).toContain('@[60rem]:grid-cols-3');
    expect(grid.className).not.toContain('grid-cols-4');
    expect(
      window.localStorage.getItem(
        'genfeed:collection-view:automation.campaigns',
      ),
    ).toBe('grid');
  });

  it('shows one fact line with credits, agents and no empty placeholders', () => {
    render(<AgentCampaignsPage />);

    const all = screen.getByTestId('campaign-all');
    const springRow = within(all)
      .getAllByTestId('campaign-row')
      .find((row) => row.textContent?.includes('Spring Launch'));

    expect(springRow).toBeDefined();
    expect(springRow).toHaveTextContent('320 / 1,000 credits · 2 agents');
    expect(springRow).not.toHaveTextContent('—');
    expect(
      within(springRow as HTMLElement).getByRole('progressbar', {
        name: '32% of credits used',
      }),
    ).toBeInTheDocument();
  });

  it('renders exactly one visible action per row and per card', () => {
    render(<AgentCampaignsPage />);

    for (const row of screen.getAllByTestId('campaign-row')) {
      expect(within(row).getAllByRole('link')).toHaveLength(1);
      expect(within(row).queryAllByRole('button')).toHaveLength(0);
    }

    const all = screen.getByTestId('campaign-all');
    fireEvent.click(within(all).getByRole('radio', { name: 'Grid' }));

    for (const card of within(all).getAllByTestId('campaign-card')) {
      expect(within(card).getAllByRole('link')).toHaveLength(1);
      expect(within(card).queryAllByRole('button')).toHaveLength(0);
    }
    expect(
      within(all).getByRole('link', { name: 'Open Spring Launch' }),
    ).toHaveAttribute('href', '/acme/demo/automation/campaigns/campaign-1');
  });

  it('keeps program cards free of nested filled boxes', () => {
    render(<AgentCampaignsPage />);

    const all = screen.getByTestId('campaign-all');
    fireEvent.click(within(all).getByRole('radio', { name: 'Grid' }));

    const card = within(all).getAllByTestId('campaign-card')[0];
    expect(card).toHaveTextContent('Launch sequence');
    expect(card.querySelector('[class*="bg-secondary"]')).toBeNull();
    expect(card.querySelector('[class*="bg-muted"]')).toBeNull();
    expect(card.querySelector('[class~="rounded"]')).toBeNull();
  });

  it('shows relative run times from the message catalog', () => {
    const now = Date.now();
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: mockCampaigns.map((campaign) =>
        campaign.id === 'campaign-1'
          ? {
              ...campaign,
              lastOrchestratedAt: new Date(now - 2 * HOUR_MS).toISOString(),
              nextOrchestratedAt: new Date(
                now + 3 * HOUR_MS + 5 * 60_000,
              ).toISOString(),
            }
          : campaign,
      ),
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<AgentCampaignsPage />);

    const springRow = within(screen.getByTestId('campaign-all'))
      .getAllByTestId('campaign-row')
      .find((row) => row.textContent?.includes('Spring Launch'));
    expect(springRow).toHaveTextContent(
      '320 / 1,000 credits · 2 agents · Last run 2h ago',
    );
    expect(
      within(screen.getByTestId('campaign-stats-strip')).getByText('in 3h'),
    ).toBeInTheDocument();
  });

  it('shows a load error with Retry instead of the empty state', () => {
    const refresh = vi.fn();
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: [],
      error: new Error('Network down'),
      isLoading: false,
      refresh,
    });

    render(<AgentCampaignsPage />);

    expect(screen.queryByText('No programs yet')).toBeNull();
    expect(screen.queryByTestId('campaign-needs-you')).toBeNull();
    expect(screen.queryByTestId('campaign-stats-strip')).toBeNull();

    const all = screen.getByTestId('campaign-all');
    expect(within(all).getByRole('alert')).toHaveTextContent(
      "Programs couldn't load.",
    );
    expect(within(all).queryByRole('radio', { name: 'Grid' })).toBeNull();

    fireEvent.click(within(all).getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('recovers the collection after a successful retry', () => {
    const refresh = vi.fn<() => Promise<void>>();
    refresh.mockImplementation(() => {
      mockUseAgentCampaigns.mockReturnValue({
        campaigns: mockCampaigns,
        error: null,
        isLoading: false,
        refresh,
      });
      return Promise.resolve();
    });
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: [],
      error: new Error('Network down'),
      isLoading: false,
      refresh,
    });

    const { rerender } = render(<AgentCampaignsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    rerender(<AgentCampaignsPage />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(getRowLabels(screen.getByTestId('campaign-all'))).toEqual([
      'Spring Launch',
      'Summer Draft',
      'Autumn Pause',
      'Winter Spend',
    ]);
    expect(screen.getByTestId('campaign-needs-you')).toBeInTheDocument();
  });

  it('restores the saved grid view after a remount', () => {
    const { unmount } = render(<AgentCampaignsPage />);
    fireEvent.click(
      within(screen.getByTestId('campaign-all')).getByRole('radio', {
        name: 'Grid',
      }),
    );
    unmount();

    render(<AgentCampaignsPage />);

    const all = screen.getByTestId('campaign-all');
    expect(within(all).getByRole('radio', { name: 'Grid' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(all).getAllByTestId('campaign-card')).toHaveLength(4);
    expect(within(all).queryAllByTestId('campaign-row')).toHaveLength(0);
  });

  it('shows a grid skeleton while loading with the grid view saved', () => {
    window.localStorage.setItem(
      'genfeed:collection-view:automation.campaigns',
      'grid',
    );
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: [],
      error: null,
      isLoading: true,
      refresh: vi.fn(),
    });

    render(<AgentCampaignsPage />);

    const all = screen.getByTestId('campaign-all');
    expect(all).toHaveAttribute('aria-busy', 'true');
    expect(within(all).getAllByTestId('skeleton-card').length).toBeGreaterThan(
      0,
    );
    expect(within(all).queryByTestId('list-rows-skeleton')).toBeNull();
    expect(screen.queryByText('No programs yet')).toBeNull();
  });

  it('shows empty state when no campaigns', () => {
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: [],
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<AgentCampaignsPage />);

    expect(screen.getByText('No programs yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create your first multi-agent program to coordinate content production.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new program/i })).toHaveLength(
      1,
    );
    expect(screen.queryByTestId('campaign-all')).toBeNull();
  });

  it('shows a list skeleton while loading', () => {
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: [],
      error: null,
      isLoading: true,
      refresh: vi.fn(),
    });

    render(<AgentCampaignsPage />);

    const all = screen.getByTestId('campaign-all');
    expect(all).toHaveAttribute('aria-busy', 'true');
    expect(within(all).getByTestId('list-rows-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('campaign-needs-you')).toBeNull();
    expect(screen.queryByText('No programs yet')).toBeNull();
  });
});
