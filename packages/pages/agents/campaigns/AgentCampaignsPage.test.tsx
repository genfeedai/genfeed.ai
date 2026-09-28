import AgentCampaignsPage from '@pages/agents/campaigns/AgentCampaignsPage';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

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
  isLoading: false,
  refresh: vi.fn(),
}));

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

  it('shows empty state when no campaigns', () => {
    mockUseAgentCampaigns.mockReturnValue({
      campaigns: [],
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
