import '@testing-library/jest-dom';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentStrategiesPage from './agent-strategies-page';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  error: vi.fn(),
  href: vi.fn((path: string) => `/org/acme/brand/demo${path}`),
  loggerError: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  runNow: vi.fn(),
  success: vi.fn(),
  toggle: vi.fn(),
  update: vi.fn(),
  useAgentStrategies: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    create: mocks.create,
    runNow: mocks.runNow,
    toggle: mocks.toggle,
    update: mocks.update,
  }),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: () => mocks.useAgentStrategies(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: mocks.href,
  }),
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

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({
    children,
    variant,
  }: {
    children: ReactNode;
    variant: string;
  }) => <span data-variant={variant}>{children}</span>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    actions,
    columns,
    emptyState,
    getRowKey,
    isLoading,
    items,
    onRowClick,
  }: {
    actions: Array<{
      icon: ReactNode | ((item: Record<string, unknown>) => ReactNode);
      isDisabled?: (item: Record<string, unknown>) => boolean;
      onClick: (item: Record<string, unknown>) => void;
      tooltip: string | ((item: Record<string, unknown>) => string);
    }>;
    columns: Array<{
      header: string;
      key: string;
      render?: (item: Record<string, unknown>) => ReactNode;
    }>;
    emptyState: ReactNode;
    getRowKey: (item: Record<string, unknown>) => string;
    isLoading?: boolean;
    items: Array<Record<string, unknown>>;
    onRowClick?: (item: Record<string, unknown>) => void;
  }) => {
    if (isLoading) {
      return <div>Loading strategies</div>;
    }

    if (items.length === 0) {
      return <div>{emptyState}</div>;
    }

    return (
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={getRowKey(item)}>
              {columns.map((column) => (
                <td key={column.key}>
                  <button type="button" onClick={() => onRowClick?.(item)}>
                    {column.render
                      ? column.render(item)
                      : String(item[column.key])}
                  </button>
                </td>
              ))}
              <td>
                {actions.map((action) => {
                  const tooltip =
                    typeof action.tooltip === 'function'
                      ? action.tooltip(item)
                      : action.tooltip;

                  return (
                    <button
                      disabled={action.isDisabled?.(item) ?? false}
                      key={`${getRowKey(item)}-${tooltip}`}
                      type="button"
                      onClick={() => action.onClick(item)}
                    >
                      {tooltip}
                    </button>
                  );
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
    right,
  }: {
    children: ReactNode;
    description: string;
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      <p>{description}</p>
      <div>{right}</div>
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    disabled,
    isDisabled,
    label,
    onClick,
    type = 'button',
  }: {
    children?: ReactNode;
    disabled?: boolean;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button disabled={disabled || isDisabled} type={type} onClick={onClick}>
      {label ?? children}
    </button>
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    'aria-label': ariaLabel,
    checked,
    onCheckedChange,
  }: {
    'aria-label'?: string;
    checked?: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <input
      aria-label={ariaLabel}
      checked={checked}
      type="checkbox"
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <footer>{children}</footer>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    id,
    onChange,
    placeholder,
    type = 'text',
    value,
  }: {
    id?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
    value?: string;
  }) => (
    <input
      id={id}
      placeholder={placeholder}
      type={type}
      value={value ?? ''}
      onChange={onChange}
    />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: ({
    id,
    onChange,
    placeholder,
    value,
  }: {
    id?: string;
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    value: string;
  }) => (
    <textarea
      id={id}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

function makeStrategy(overrides: Record<string, unknown> = {}) {
  return {
    agentType: AgentType.X_CONTENT,
    autonomyMode: AgentAutonomyMode.SUPERVISED,
    autoPublishConfidenceThreshold: 0.8,
    budgetPolicy: {
      monthlyCreditBudget: 500,
      reserveTrendBudget: 125,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    creditsUsedToday: 12,
    dailyCreditBudget: 100,
    goalProfile: 'reach_traffic',
    id: 'strategy-1',
    isActive: true,
    isEnabled: true,
    label: 'Daily X Growth',
    lastRunAt: '2026-01-01T02:00:00.000Z',
    minCreditThreshold: 50,
    opportunitySources: {
      eventTriggersEnabled: true,
      evergreenCadenceEnabled: true,
      trendWatchersEnabled: true,
    },
    platforms: ['twitter'],
    publishPolicy: {
      autoPublishEnabled: false,
      minImageScore: 75,
      minPostScore: 70,
    },
    reportingPolicy: {
      dailyDigestEnabled: true,
      weeklySummaryEnabled: true,
    },
    runFrequency: AgentRunFrequency.DAILY,
    skillSlugs: ['content-writing'],
    timezone: 'UTC',
    topics: ['launches', 'AI'],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AgentStrategiesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue(makeStrategy({ id: 'new-strategy' }));
    mocks.runNow.mockResolvedValue(undefined);
    mocks.toggle.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(makeStrategy());
    mocks.refresh.mockResolvedValue(undefined);
    mocks.useAgentStrategies.mockReturnValue({
      isLoading: false,
      refresh: mocks.refresh,
      strategies: [
        makeStrategy(),
        makeStrategy({
          agentType: AgentType.VIDEO_CREATOR,
          autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
          id: 'strategy-2',
          isActive: false,
          isEnabled: false,
          label: 'Video Autopilot',
          platforms: [],
          skillSlugs: [],
          topics: [],
        }),
      ],
    });
  });

  it('renders strategy table data and handles row navigation/actions', async () => {
    render(<AgentStrategiesPage />);

    expect(screen.getByRole('heading', { name: 'Autopilot' })).toBeVisible();
    expect(screen.getByText('Daily X Growth')).toBeVisible();
    expect(screen.getByText('launches, AI')).toBeVisible();
    expect(screen.getByText('Video Autopilot')).toBeVisible();
    expect(screen.getAllByText('No topics configured').length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText('Daily X Growth')[0]);
    expect(mocks.push).toHaveBeenCalledWith('/orchestration/strategy-1');

    fireEvent.click(screen.getAllByRole('button', { name: 'Run now' })[0]);
    await waitFor(() => {
      expect(mocks.runNow).toHaveBeenCalledWith('strategy-1');
      expect(mocks.success).toHaveBeenCalledWith('Strategy run triggered');
      expect(mocks.refresh).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pause strategy' }));
    await waitFor(() => {
      expect(mocks.toggle).toHaveBeenCalledWith('strategy-1');
      expect(mocks.success).toHaveBeenCalledWith('Strategy paused');
    });
  });

  it('creates an autopilot policy from the dialog payload', async () => {
    render(<AgentStrategiesPage />);

    fireEvent.click(screen.getByRole('button', { name: /add autopilot/i }));

    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText('Add Autopilot Policy')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Policy Label'), {
      target: { value: 'Image Growth Autopilot' },
    });
    fireEvent.change(screen.getByLabelText('Topics'), {
      target: { value: 'launches, product demos' },
    });
    fireEvent.change(screen.getByPlaceholderText(/content-writing/i), {
      target: { value: 'image-generation, brand-voice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Enable autopilot auto publish',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Autopilot Policy' }),
    );

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          isEnabled: true,
          label: 'Image Growth Autopilot',
          platforms: ['twitter', 'instagram'],
          publishPolicy: expect.objectContaining({
            autoPublishEnabled: true,
          }),
          skillSlugs: ['image-generation', 'brand-voice'],
          topics: ['launches', 'product demos'],
        }),
      );
      expect(mocks.success).toHaveBeenCalledWith('Strategy created');
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it('edits an existing policy and validates required fields', async () => {
    render(<AgentStrategiesPage />);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Edit strategy' })[0],
    );
    expect(screen.getByText('Edit Autopilot Policy')).toBeVisible();

    const labelInput = screen.getByLabelText('Policy Label');
    fireEvent.change(labelInput, { target: { value: '' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Autopilot Changes' }),
    );

    expect(mocks.error).toHaveBeenCalledWith('Strategy label is required');
    expect(mocks.update).not.toHaveBeenCalled();

    fireEvent.change(labelInput, {
      target: { value: 'Updated Growth Policy' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Twitter / X' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Autopilot Changes' }),
    );

    expect(mocks.error).toHaveBeenCalledWith('Select at least one platform');

    fireEvent.click(screen.getByRole('button', { name: 'LinkedIn' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Autopilot Changes' }),
    );

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(
        'strategy-1',
        expect.objectContaining({
          label: 'Updated Growth Policy',
          platforms: ['linkedin'],
        }),
      );
      expect(mocks.success).toHaveBeenCalledWith('Strategy updated');
    });
  });

  it('reports service failures and renders the empty state', async () => {
    mocks.runNow.mockRejectedValueOnce(new Error('run failed'));

    render(<AgentStrategiesPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Run now' })[0]);

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith('Failed to run strategy', {
        error: expect.any(Error),
      });
      expect(mocks.error).toHaveBeenCalledWith(
        'Failed to trigger strategy run',
      );
    });

    mocks.useAgentStrategies.mockReturnValue({
      isLoading: false,
      refresh: mocks.refresh,
      strategies: [],
    });

    render(<AgentStrategiesPage />);
    expect(screen.getByText('No autopilot policies yet')).toBeVisible();
    expect(screen.getByText('Open Full Wizard')).toBeVisible();
  });
});
