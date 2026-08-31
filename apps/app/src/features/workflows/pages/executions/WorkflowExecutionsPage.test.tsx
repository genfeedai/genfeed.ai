import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowExecutionsPage from './WorkflowExecutionsPage';

const mocks = vi.hoisted(() => ({
  AuthenticationTokenUnavailableError: class AuthenticationTokenUnavailableError extends Error {
    constructor() {
      super('Authentication token unavailable');
      this.name = 'AuthenticationTokenUnavailableError';
    }
  },
  getService: vi.fn(),
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
  collectionScope: {
    brandId: 'brand-fud' as string | undefined,
    isReady: true,
    organizationId: 'org-demo' as string,
    pageScope: 'brand' as 'org' | 'brand',
  },
  list: vi.fn(),
  listExecutions: vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  toBrandListParams: (scope: { brandId?: string }) =>
    scope.brandId ? { brandId: scope.brandId } : {},
  useCollectionScope: () => mocks.collectionScope,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  AuthenticationTokenUnavailableError:
    mocks.AuthenticationTokenUnavailableError,
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children?: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ value }: { value?: string }) => (
    <span>{value ?? ''}</span>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      emptyTitle: 'No executions yet',
      retry: 'Retry',
      title: 'Execution History',
    };
    return messages[key] ?? key;
  },
}));

describe('WorkflowExecutionsPage', () => {
  beforeEach(() => {
    mocks.collectionScope = {
      brandId: 'brand-fud',
      isReady: true,
      organizationId: 'org-demo',
      pageScope: 'brand',
    };
    mocks.list.mockResolvedValue([{ id: 'wf-1', label: 'Daily digest' }]);
    mocks.listExecutions.mockResolvedValue([
      {
        createdAt: '2026-08-19T09:00:00.000Z',
        id: 'exec-1',
        progress: 100,
        startedAt: '2026-08-19T09:00:00.000Z',
        status: 'completed',
        trigger: 'schedule',
        workflow: { id: 'wf-1', label: 'Daily newsletter for FUD News' },
        workflowId: 'wf-1',
      },
    ]);
    mocks.getService.mockResolvedValue({
      list: mocks.list,
      listExecutions: mocks.listExecutions,
    });
  });

  it('does not fetch or show an empty state before brand scope is ready', async () => {
    mocks.collectionScope = {
      brandId: undefined,
      isReady: false,
      organizationId: '',
      pageScope: 'org',
    };

    render(<WorkflowExecutionsPage />);

    expect(screen.queryByText('No executions yet')).toBeNull();
    expect(screen.queryByText('Daily digest')).toBeNull();
    expect(mocks.listExecutions).not.toHaveBeenCalled();
  });

  it('renders execution history from the URL brand org even when Better Auth orgId is unset', async () => {
    render(<WorkflowExecutionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Daily newsletter for FUD News'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('No executions yet')).toBeNull();
    expect(screen.queryByText(/exec-1/)).toBeNull();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(mocks.listExecutions).toHaveBeenCalledTimes(1);
    expect(mocks.listExecutions).toHaveBeenCalledWith({
      brandId: 'brand-fud',
      limit: 20,
      offset: 0,
    });
    expect(mocks.list).toHaveBeenCalledWith({
      brandId: 'brand-fud',
      limit: 100,
    });
  });

  it('uses the included workflow label when the catalog list is empty', async () => {
    mocks.list.mockResolvedValue([]);

    render(<WorkflowExecutionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Daily newsletter for FUD News'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Untitled workflow')).toBeNull();
  });

  it('renders the content shell while executions are still loading', async () => {
    let resolveExecutions: (value: unknown[]) => void = () => {};
    mocks.listExecutions.mockReturnValue(
      new Promise((resolve) => {
        resolveExecutions = resolve;
      }),
    );

    render(<WorkflowExecutionsPage />);

    expect(screen.getByText('Execution History')).toBeInTheDocument();
    expect(screen.getByTestId('executions-content')).toBeInTheDocument();
    expect(screen.getByTestId('executions-skeleton')).toBeInTheDocument();

    resolveExecutions([]);
    await waitFor(() => {
      expect(screen.queryByTestId('executions-skeleton')).toBeNull();
    });
  });

  it('clears the first-load skeleton when the auth token is not ready', async () => {
    mocks.getService.mockRejectedValue(
      new mocks.AuthenticationTokenUnavailableError(),
    );

    render(<WorkflowExecutionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Authentication token unavailable'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(mocks.listExecutions).not.toHaveBeenCalled();
  });
});
