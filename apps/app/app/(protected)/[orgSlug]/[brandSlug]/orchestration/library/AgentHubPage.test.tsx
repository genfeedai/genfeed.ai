import '@testing-library/jest-dom/vitest';
import { AgentType } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentHubPage from './AgentHubPage';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  getService: vi.fn(),
  loggerError: vi.fn(),
  refresh: vi.fn(),
  runNow: vi.fn(),
  strategies: [] as unknown[],
  success: vi.fn(),
  toggle: vi.fn(),
  isLoading: false,
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: () => ({
    isLoading: mocks.isLoading,
    refresh: mocks.refresh,
    strategies: mocks.strategies,
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
    label,
    onClick,
  }: {
    icon?: ReactNode;
    label?: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  ),
}));

describe('AgentHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isLoading = false;
    mocks.strategies = [];
    mocks.getService.mockResolvedValue({
      runNow: mocks.runNow,
      toggle: mocks.toggle,
    });
    mocks.refresh.mockResolvedValue(undefined);
    mocks.runNow.mockResolvedValue(undefined);
    mocks.toggle.mockResolvedValue(undefined);
  });

  it('renders loading and empty agent hub states', () => {
    mocks.isLoading = true;
    const { rerender } = render(<AgentHubPage />);

    expect(screen.getByText('Agent Hub')).toBeVisible();
    expect(screen.getByText('Manage your content agents.')).toBeVisible();
    expect(screen.getByText(/New Agent/).closest('a')).toHaveAttribute(
      'href',
      '/orchestration/new',
    );
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(3);

    mocks.isLoading = false;
    rerender(<AgentHubPage />);
    expect(screen.getByText('No agents yet')).toBeVisible();
    expect(screen.getByText('Create your first agent')).toBeVisible();
  });

  it('renders agent cards and handles toggle, run-now, and refresh interval', async () => {
    mocks.strategies = [
      {
        agentType: AgentType.IMAGE_CREATOR,
        brand: 'Moonrise',
        creditsUsedToday: 12,
        dailyCreditBudget: 50,
        id: 'agent-1',
        isActive: true,
        label: 'Image Producer',
        lastRunAt: new Date(Date.now() - 60_000).toISOString(),
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
      '/orchestration/agent-1',
    );

    fireEvent.click(screen.getAllByText('Run Now')[0]);
    await waitFor(() => {
      expect(mocks.runNow).toHaveBeenCalledWith('agent-1');
    });
    expect(mocks.success).toHaveBeenCalledWith('Agent run triggered');

    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() => {
      expect(mocks.toggle).toHaveBeenCalledWith('agent-1');
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledWith('Agent status updated');

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
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
    mocks.toggle.mockRejectedValueOnce(new Error('toggle failed'));

    render(<AgentHubPage />);

    fireEvent.click(screen.getByText('Run Now'));
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
