import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import AgentDetailPage from './AgentDetailPage';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useResourceMock = vi.fn();

vi.mock('next/dynamic', () => ({
  default: () => () => <div>Agent Run Content Grid</div>,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategy', () => ({
  useAgentStrategy: () => ({
    isLoading: false,
    refresh: vi.fn(),
    strategy: {
      agentType: 'general',
      autonomyMode: 'auto_publish',
      brand: 'Brand One',
      consecutiveFailures: 0,
      creditsUsedThisWeek: 9,
      creditsUsedToday: 3,
      dailyCreditBudget: 20,
      id: 'strategy-1',
      isActive: true,
      label: 'Autopilot',
      weeklyCreditBudget: 100,
    },
  }),
}));

vi.mock('@hooks/data/agent-runs/use-agent-runs', () => ({
  useAgentRuns: () => ({
    isLoading: false,
    runs: [
      {
        completedAt: '2026-03-26T10:15:00.000Z',
        conversation: undefined,
        createdAt: '2026-03-26T10:00:00.000Z',
        creditBudget: undefined,
        creditsUsed: 6,
        durationMs: 18000,
        id: 'run-1',
        label: 'Trend scan',
        metadata: {
          actualModel: 'google/gemini-2.5-flash',
          requestedModel: 'openrouter/auto',
          routingPolicy: 'fresh-live-data',
          webSearchEnabled: true,
        },
        objective: 'Find latest creator trends',
        organization: 'org-1',
        parentRun: undefined,
        progress: 100,
        retryCount: 0,
        startedAt: '2026-03-26T10:01:00.000Z',
        status: 'completed',
        summary: undefined,
        toolCalls: [],
        trigger: 'manual',
        updatedAt: '2026-03-26T10:15:00.000Z',
        user: 'user-1',
      },
    ],
  }),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => useResourceMock(...args),
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
  useSearchParams: () => ({
    get: (key: string) => (key === 'opportunity' ? 'opp-1' : null),
  }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: ReactNode;
    description?: string;
    label: string;
  }) => (
    <section>
      <h1>{label}</h1>
      {description ? <p>{description}</p> : null}
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

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

describe('AgentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResourceMock.mockReturnValue({
      data: [
        {
          decisionReason: 'Trend watcher matched a current platform trend.',
          expectedTrafficScore: 89,
          id: 'opp-1',
          sourceType: 'trend',
          status: 'queued',
          topic: 'AI launch hooks',
        },
      ],
      isLoading: false,
    });
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
      screen.getByText('google/gemini-2.5-flash via openrouter/auto'),
    ).toBeInTheDocument();
  });
});
