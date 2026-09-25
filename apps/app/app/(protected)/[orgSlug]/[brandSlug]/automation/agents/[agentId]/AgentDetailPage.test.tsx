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
  Button: ({ label, onClick }: { label?: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

describe('AgentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => ({
      data:
        queryKey[0] === 'agent-strategy'
          ? {
              id: 'strategy-1',
              brandId: 'brand-1',
              agentType: 'general',
              autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
              isActive: true,
              label: 'Content agent',
              consecutiveFailures: 0,
              dailyCreditBudget: 20,
              weeklyCreditBudget: 100,
              creditsUsedToday: 3,
              creditsUsedThisWeek: 9,
              runHistory: [],
            }
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
            : queryKey[0] === 'agent-performance'
              ? undefined
              : [],
      isLoading: false,
      refetch: vi.fn(),
    }));
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

  it('shows routed model metadata in run history', () => {
    render(<AgentDetailPage agentId="strategy-1" />);

    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(
      screen.getByText('google/gemini-2.5-flash via openai/gpt-5.6-terra'),
    ).toBeInTheDocument();
  });
});
