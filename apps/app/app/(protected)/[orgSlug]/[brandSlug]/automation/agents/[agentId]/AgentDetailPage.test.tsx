import { AgentAutonomyMode } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import AgentDetailPage from './AgentDetailPage';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQueryMock = vi.fn();

vi.mock('next/dynamic', () => ({
  default: () => () => <div>Agent Run Content Grid</div>,
}));

vi.mock('./AgentWorkflowBindCard', () => ({
  default: () => <div>Workflow bind card</div>,
}));

vi.mock('./AgentActivitySection', () => ({
  default: () => <div data-testid="agent-activity-section" />,
}));

vi.mock('../../autopilot/AgentStrategyDialog', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Agent schedule dialog</div> : null,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isCollectionFetchReady: () => true,
  toBrandListParams: () => ({ brandId: 'brand-1' }),
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'brand',
  }),
}));

vi.mock('@hooks/data/workflow-executions/use-workflow-executions', () => ({
  useWorkflowExecutions: () => ({
    cancelExecution: vi.fn(),
    executions: [
      {
        completedAt: '2026-03-26T10:15:00.000Z',
        createdAt: '2026-03-26T10:00:00.000Z',
        creditsUsed: 6,
        durationMs: 18000,
        id: 'execution-1',
        metadata: {
          actualModel: 'google/gemini-2.5-flash',
          requestedModel: 'openai/gpt-5.6-terra',
          strategyId: 'strategy-1',
        },
        nodeResults: [],
        organizationId: 'org-1',
        startedAt: '2026-03-26T10:01:00.000Z',
        status: 'COMPLETED',
        updatedAt: '2026-03-26T10:15:00.000Z',
      },
    ],
    isLoading: false,
    refresh: vi.fn(),
    stats: {
      active: 0,
      completed: 1,
      failed: 0,
      total: 1,
      totalCredits: 6,
    },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useQueryClient: vi.fn(() => ({
    setQueryData: vi.fn(),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'brand-one', orgSlug: 'org-one' }),
  usePathname: () => '/org-one/brand-one/automation/agents/strategy-1',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'opportunity' ? 'opp-1' : null),
  }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
    right,
  }: {
    children: ReactNode;
    description?: string;
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      {description ? <p>{description}</p> : null}
      {right}
      {children}
    </section>
  ),
}));

vi.mock('@ui/kpi/kpi-section/KPISection', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label }: { label: ReactNode }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
    icon,
    isDisabled,
    label,
    onClick,
  }: {
    asChild?: boolean;
    children?: ReactNode;
    icon?: ReactNode;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
  }) =>
    asChild ? (
      (children ?? null)
    ) : (
      <button disabled={isDisabled} onClick={onClick} type="button">
        {icon}
        {label}
      </button>
    ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

// Flattened like the other collection-actions consumers: the real Radix
// dropdown needs pointer events jsdom does not implement.
vi.mock('@ui/collection/CollectionItemActions', () => ({
  default: ({
    primary,
    overflow,
  }: {
    primary?: ReactNode;
    overflow: Array<{ id: string; label: string; onSelect?: () => void }>;
  }) => (
    <div data-testid="header-actions">
      {primary}
      {overflow.map((action) => (
        <button key={action.id} onClick={action.onSelect} type="button">
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

const baseStrategy = {
  agentType: 'general',
  autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
  brandId: 'brand-1',
  consecutiveFailures: 0,
  creditsUsedThisWeek: 9,
  creditsUsedToday: 3,
  dailyCreditBudget: 20,
  id: 'strategy-1',
  isActive: true,
  label: 'Content agent',
  runHistory: [],
  weeklyCreditBudget: 100,
};

function mockQueries(overrides: {
  strategy?: Partial<typeof baseStrategy>;
  posts?: Array<Record<string, unknown>>;
}) {
  useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === 'agent-strategy'
        ? { ...baseStrategy, ...overrides.strategy }
        : queryKey[0] === 'agent-opportunities'
          ? [
              {
                decisionReason:
                  'Trend watcher matched a current platform trend.',
                expectedTrafficScore: 89,
                id: 'opp-1',
                sourceType: 'trend',
                status: 'queued',
                topic: 'AI launch hooks',
              },
            ]
          : queryKey[0] === 'agent-posts'
            ? (overrides.posts ?? [])
            : queryKey[0] === 'agent-performance'
              ? undefined
              : [],
    isLoading: false,
    refetch: vi.fn(),
  }));
}

describe('AgentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueries({});
  });

  it('keys every agent query by organization, brand, and agent', () => {
    render(<AgentDetailPage agentId="strategy-1" />);
    for (const resource of [
      'agent-strategy',
      'agent-opportunities',
      'agent-posts',
      'agent-reports',
      'agent-performance',
    ]) {
      expect(useQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: expect.arrayContaining([
            resource,
            'org-1',
            'brand-1',
            'strategy-1',
          ]),
        }),
      );
    }
  });

  it('shows a strategy request failure separately from not found', () => {
    useQueryMock.mockImplementation(() => ({
      isError: true,
      isLoading: false,
      refetch: vi.fn(),
    }));
    render(<AgentDetailPage agentId="strategy-1" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load this agent.',
    );
    expect(screen.queryByText(/Agent not found/)).not.toBeInTheDocument();
  });

  it('shows exactly one primary button — Run now — with the rest in the overflow menu', () => {
    render(<AgentDetailPage agentId="strategy-1" />);

    const actions = screen.getByTestId('header-actions');
    expect(actions.querySelectorAll('button')).toHaveLength(4);
    expect(actions).toHaveTextContent('Run now');
    expect(actions).toHaveTextContent('Schedule');
    expect(actions).toHaveTextContent('Run workflow');
    expect(actions).toHaveTextContent('Deactivate');
  });

  it('opens schedule settings on the agent instead of a separate Autopilot desk', () => {
    render(<AgentDetailPage agentId="strategy-1" />);

    expect(screen.queryByText('Agent schedule dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(screen.getByText('Agent schedule dialog')).toBeVisible();
  });

  it('shows opportunity context when opened from the publishing inbox', () => {
    render(<AgentDetailPage agentId="strategy-1" />);

    expect(screen.getByText('Review context')).toBeInTheDocument();
    expect(screen.getByText('AI launch hooks')).toBeInTheDocument();
    expect(
      screen.getByText('Trend watcher matched a current platform trend.'),
    ).toBeInTheDocument();
    expect(screen.getByText('89')).toBeInTheDocument();
  });

  it('shows the known facts on one line, omitting the unknown brand', () => {
    render(<AgentDetailPage agentId="strategy-1" />);

    const factLine = screen.getByTestId('record-fact-line');
    expect(factLine).toHaveTextContent('Autonomy');
    expect(factLine).toHaveTextContent('Auto-Publish');
    expect(factLine).toHaveTextContent('Credits today');
    expect(factLine).not.toHaveTextContent('Brand');
  });

  it('hides Needs you when nothing needs the viewer', () => {
    render(<AgentDetailPage agentId="strategy-1" />);

    expect(
      screen.queryByRole('heading', { name: 'Needs you' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces consecutive run failures in Needs you with a link to Runs', () => {
    mockQueries({ strategy: { consecutiveFailures: 3 } });
    render(<AgentDetailPage agentId="strategy-1" />);

    expect(
      screen.getByRole('heading', { name: 'Needs you' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View runs' })).toHaveAttribute(
      'href',
      '/org-one/brand-one/automation/runs',
    );
  });

  it('surfaces posts awaiting review in Needs you with a link to the review queue', () => {
    mockQueries({
      posts: [
        {
          id: 'draft-1',
          reviewDecision: 'unset',
          targetExecutionState: 'draft',
        },
      ],
    });
    render(<AgentDetailPage agentId="strategy-1" />);

    expect(
      screen.getByRole('link', { name: 'Review content' }),
    ).toHaveAttribute('href', '/org-one/brand-one/publishing/review');
  });

  it('renders the merged Activity section instead of separate work, performance and run sections', () => {
    render(<AgentDetailPage agentId="strategy-1" />);

    expect(screen.getByTestId('agent-activity-section')).toBeInTheDocument();
  });
});
