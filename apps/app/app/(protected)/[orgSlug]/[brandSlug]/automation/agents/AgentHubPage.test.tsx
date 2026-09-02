import '@testing-library/jest-dom/vitest';
import { AgentType } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentHubPage from './AgentHubPage';

const mocks = vi.hoisted(() => ({
  addIntent: null as string | null,
  error: vi.fn(),
  getService: vi.fn(),
  getWorkflowBinding: vi.fn(),
  loggerError: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  runNow: vi.fn(),
  runWorkflow: vi.fn(),
  setActive: vi.fn(),
  strategies: [] as unknown[],
  success: vi.fn(),
  isLoading: false,
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: () => ({
    isLoading: mocks.isLoading,
    refresh: mocks.refresh,
    strategies: mocks.strategies,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-one',
    isReady: true,
    organizationId: 'org-one',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/automation/agent-strategies.service', () => ({
  AgentStrategiesService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.error,
      success: mocks.success,
    }),
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'brand-one', orgSlug: 'org-one' }),
  usePathname: () => '/org-one/brand-one/automation/agents',
  useSearchParams: () => ({ get: () => mocks.addIntent }),
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
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
    children?: ReactNode;
    description?: string;
    label?: string;
    right?: ReactNode;
  }) => (
    <main>
      <h1>{label}</h1>
      <p>{description}</p>
      {right}
      {children}
    </main>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    icon,
    isDisabled,
    label,
    onClick,
  }: {
    icon?: ReactNode;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  ),
}));

vi.mock('./AgentWorkflowRunDialog', () => ({
  default: ({
    isOpen,
    onSubmit,
    strategy,
  }: {
    isOpen: boolean;
    onSubmit: (input: { topic?: string }) => Promise<void>;
    strategy: { id: string; label: string } | null;
  }) =>
    isOpen ? (
      <div>
        <p>Workflow dialog for {strategy?.label}</p>
        <button type="button" onClick={() => onSubmit({ topic: 'Launch' })}>
          Confirm workflow run
        </button>
      </div>
    ) : null,
}));

vi.mock('./AddAgentDialog', () => ({
  default: ({
    initialMode,
    isOpen,
    onCreated,
    onOpenChange,
  }: {
    initialMode: string;
    isOpen: boolean;
    onCreated: () => Promise<void>;
    onOpenChange: (open: boolean) => void;
  }) =>
    isOpen ? (
      <div>
        <p>Add agent dialog ({initialMode})</p>
        <button type="button" onClick={() => onCreated()}>
          Finish add agent
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Close add agent
        </button>
      </div>
    ) : null,
}));

describe('AgentHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addIntent = null;
    mocks.isLoading = false;
    mocks.strategies = [];
    mocks.getService.mockResolvedValue({
      getWorkflowBinding: mocks.getWorkflowBinding,
      runNow: mocks.runNow,
      runWorkflow: mocks.runWorkflow,
      setActive: mocks.setActive,
    });
    mocks.refresh.mockResolvedValue(undefined);
    mocks.runNow.mockResolvedValue(undefined);
    mocks.runWorkflow.mockResolvedValue({
      executionId: 'exec-12345678',
      status: 'running',
    });
    mocks.getWorkflowBinding.mockResolvedValue({
      inputs: [],
      missingRequiredKeys: [],
      preferredWorkflowTemplateId: 'founder-editorial-illustration',
      workflowLabel: 'Illustration',
    });
    mocks.setActive.mockResolvedValue(undefined);
  });

  it('opens the requested add-agent mode from legacy deep links', () => {
    mocks.addIntent = 'custom';

    render(<AgentHubPage />);

    expect(screen.getByText('Add agent dialog (custom)')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close add agent' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/org-one/brand-one/automation/agents',
      { scroll: false },
    );
  });

  it('renders loading and empty agent hub states', async () => {
    mocks.isLoading = true;
    const { rerender } = render(<AgentHubPage />);

    expect(screen.getByText('Agents')).toBeVisible();
    expect(
      screen.getByText(
        'Content agents that fill workflow prompts and assets, then run deterministic graphs.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add agent' })).toBeVisible();
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(3);

    mocks.isLoading = false;
    rerender(<AgentHubPage />);
    expect(screen.getByText('No agents yet')).toBeVisible();
    expect(screen.getByText('Add your first agent')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Add agent' }));
    expect(screen.getByText('Add agent dialog (library)')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Finish add agent' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('renders agent cards and handles toggle, autopilot, workflow run, and refresh interval', async () => {
    mocks.strategies = [
      {
        agentType: AgentType.IMAGE_CREATOR,
        brand: {
          id: 'brand-1',
          label: 'Moonrise',
          slug: 'moonrise',
        },
        creditsUsedToday: 12,
        dailyCreditBudget: 50,
        id: 'agent-1',
        isActive: true,
        label: 'Image Producer',
        lastRunAt: new Date(Date.now() - 60_000).toISOString(),
        preferredWorkflowTemplateId: 'founder-editorial-illustration',
      },
      {
        agentType: 'custom_agent',
        creditsUsedToday: 0,
        dailyCreditBudget: 10,
        id: 'agent-2',
        isActive: false,
        label: 'Custom Producer',
        lastRunAt: null,
      },
    ];

    render(<AgentHubPage />);

    expect(screen.getByText('Image Producer')).toBeVisible();
    expect(screen.getByText('Image Creator')).toBeVisible();
    expect(screen.getByText('Brand: Moonrise')).toBeVisible();
    expect(screen.getByText('12 / 50')).toBeVisible();
    expect(screen.getByText('Custom Producer')).toBeVisible();
    expect(screen.getByText('custom_agent')).toBeVisible();
    expect(screen.getByText('Never')).toBeVisible();
    expect(screen.getAllByText('View detail')[0].closest('a')).toHaveAttribute(
      'href',
      '/automation/agents/agent-1',
    );

    fireEvent.click(screen.getAllByText('Autopilot')[0]);
    await waitFor(() => {
      expect(mocks.runNow).toHaveBeenCalledWith('agent-1');
    });
    expect(mocks.success).toHaveBeenCalledWith('Agent run triggered');

    fireEvent.click(screen.getAllByText('Run workflow')[0]);
    await waitFor(() => {
      expect(mocks.getWorkflowBinding).toHaveBeenCalledWith('agent-1');
    });
    expect(
      screen.getByText('Workflow dialog for Image Producer'),
    ).toBeVisible();

    fireEvent.click(screen.getByText('Confirm workflow run'));
    await waitFor(() => {
      expect(mocks.runWorkflow).toHaveBeenCalledWith('agent-1', {
        topic: 'Launch',
      });
    });

    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() => {
      expect(mocks.setActive).toHaveBeenCalledWith('agent-1', false);
    });
    expect(mocks.success).toHaveBeenCalledWith('Agent status updated');
  });

  it('reports toggle and run failures', async () => {
    mocks.strategies = [
      {
        agentType: AgentType.VIDEO_CREATOR,
        creditsUsedToday: 0,
        dailyCreditBudget: 10,
        id: 'agent-1',
        isActive: false,
        label: 'Video Producer',
        lastRunAt: null,
      },
    ];
    mocks.runNow.mockRejectedValueOnce(new Error('run failed'));
    mocks.setActive.mockRejectedValueOnce(new Error('toggle failed'));

    render(<AgentHubPage />);

    fireEvent.click(screen.getByText('Autopilot'));
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to trigger agent run',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
    expect(mocks.error).toHaveBeenCalledWith('Failed to trigger run');

    fireEvent.click(screen.getByText('Activate'));
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to toggle agent',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
    expect(mocks.error).toHaveBeenCalledWith('Failed to update agent status');
  });
});
