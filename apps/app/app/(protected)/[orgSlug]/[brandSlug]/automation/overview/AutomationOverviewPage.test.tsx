import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AutomationOverviewPage from './AutomationOverviewPage';
import '@testing-library/jest-dom/vitest';

const executionState = vi.hoisted(() => ({
  executions: [] as Array<{ id: string; status: string }>,
  isError: false,
  isLoading: false,
  refresh: vi.fn(),
  stats: {
    active: 0,
    completed: 0,
    failed: 0,
    total: 0,
    totalCredits: 0,
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme-org/acme-creator${path}`,
  }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isCollectionFetchReady: () => true,
  toBrandListParams: () => ({ brandId: 'brand-1' }),
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-123',
    pageScope: 'brand',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    listPage: async () => ({
      items: [],
      pagination: { limit: 50, page: 1, pages: 1, total: 0 },
    }),
  }),
}));

vi.mock('@hooks/data/workflow-executions/use-workflow-executions', () => ({
  useWorkflowExecutions: () => ({
    cancelExecution: vi.fn(),
    executions: executionState.executions,
    isError: executionState.isError,
    isLoading: executionState.isLoading,
    isRefreshing: false,
    refresh: executionState.refresh,
    stats: executionState.stats,
  }),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: () => ({
    isLoading: false,
    refresh: vi.fn(),
    strategies: [],
  }),
}));

vi.mock('../autopilot/ContentPlansSection', () => ({
  default: () => <div>Recent plans</div>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      items: [],
      pagination: { limit: 50, page: 1, pages: 1, total: 0 },
    },
    isError: false,
    isLoading: false,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: vi.fn(() => ({
    brandSlug: 'acme-creator',
    orgSlug: 'acme-org',
  })),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('AutomationOverviewPage', () => {
  beforeAll(() => {
    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds = [];

      disconnect() {}
      observe() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      unobserve() {}
    }

    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
      writable: true,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    executionState.executions = [];
    executionState.isError = false;
    executionState.isLoading = false;
    executionState.stats = {
      active: 0,
      completed: 0,
      failed: 0,
      total: 0,
      totalCredits: 0,
    };
  });

  it('renders a module dashboard instead of launch shortcuts', () => {
    render(<AutomationOverviewPage />);

    expect(
      screen.getByRole('heading', { name: 'Active runs' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Recent activity' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Recent plans')).toBeInTheDocument();
    expect(
      screen.getByText('No automation running right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Launch')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick Actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Activity Snapshot')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /inspect workspace/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /open workflows/i }),
    ).not.toBeInTheDocument();
  });

  it('does not include a standalone activities route card', () => {
    render(<AutomationOverviewPage />);
    expect(
      screen.queryByRole('link', { name: /view activities/i }),
    ).not.toBeInTheDocument();
  });

  it('does not duplicate Settings configuration inside Automation', () => {
    render(<AutomationOverviewPage />);

    expect(screen.queryByText('Configuration')).not.toBeInTheDocument();
    expect(screen.queryByText('Configuration Center')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /open configuration/i }),
    ).not.toBeInTheDocument();
  });

  it('surfaces live run stats instead of page shortcuts', () => {
    executionState.stats = {
      active: 2,
      completed: 4,
      failed: 1,
      total: 7,
      totalCredits: 18,
    };
    render(<AutomationOverviewPage />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.queryByText('On schedule')).not.toBeInTheDocument();
    expect(screen.queryByText('Unscheduled')).not.toBeInTheDocument();
  });
});
