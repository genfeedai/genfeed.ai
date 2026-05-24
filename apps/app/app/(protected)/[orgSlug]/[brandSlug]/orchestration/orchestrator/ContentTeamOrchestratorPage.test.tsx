import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentTeamOrchestratorPage from './ContentTeamOrchestratorPage';

const mocks = vi.hoisted(() => ({
  campaignCreate: vi.fn(),
  goalCreate: vi.fn(),
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  push: vi.fn(),
  strategyCreate: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [
      { id: 'brand-1', label: 'Primary Brand' },
      { id: 'brand-2', label: 'Second Brand' },
    ],
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token-1'),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: () => ({
    strategies: [
      {
        agentType: 'writer',
        displayRole: 'Writer',
        id: 'existing-strategy-1',
        label: 'Existing Writer',
      },
    ],
  }),
}));

vi.mock('@pages/agents/content-team/content-team-presets', () => ({
  buildBlueprintStrategyInputs: vi.fn((blueprintId: string, input: unknown) => [
    { blueprintId, input, role: 'writer' },
    { blueprintId, input, role: 'editor' },
  ]),
  buildContentTeamCampaignInput: vi.fn((input: unknown) => ({
    campaign: input,
  })),
  buildContentTeamGoalInput: vi.fn((input: unknown) => ({ goal: input })),
  CONTENT_TEAM_BLUEPRINT_PRESETS: [
    {
      description: 'Builds a two-role launch pod.',
      id: 'launch-pod',
      label: 'Launch Pod',
      roleIds: ['writer', 'editor'],
    },
    {
      description: 'No starter roles.',
      id: 'empty-blueprint',
      label: 'Empty Blueprint',
      roleIds: [],
    },
  ],
  CONTENT_TEAM_ROLE_PRESETS: [
    { displayRole: 'Writer', id: 'writer' },
    { displayRole: 'Editor', id: 'editor' },
  ],
}));

vi.mock('@services/automation/agent-campaigns.service', () => ({
  AgentCampaignsService: {
    getInstance: () => ({
      create: mocks.campaignCreate,
    }),
  },
}));

vi.mock('@services/automation/agent-goals.service', () => ({
  AgentGoalsService: {
    getInstance: () => ({
      create: mocks.goalCreate,
    }),
  },
}));

vi.mock('@services/automation/agent-strategies.service', () => ({
  AgentStrategiesService: {
    getInstance: () => ({
      create: mocks.strategyCreate,
    }),
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
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: ReactNode;
    description?: string;
    label?: string;
  }) => (
    <aside>
      <h2>{label}</h2>
      <p>{description}</p>
      {children}
    </aside>
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: ReactNode;
    description?: string;
    label?: string;
  }) => (
    <main>
      <h1>{label}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    label,
    onClick,
    type = 'button',
  }: {
    label: string;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button type={type} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    'aria-label': ariaLabel,
    checked,
    onCheckedChange,
  }: {
    'aria-label': string;
    checked?: boolean;
    onCheckedChange: () => void;
  }) => (
    <button
      aria-pressed={checked}
      type="button"
      aria-label={ariaLabel}
      onClick={onCheckedChange}
    >
      {checked ? 'selected' : 'not selected'}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
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
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

function changeField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), {
    target: { value },
  });
}

function submitForm() {
  fireEvent.submit(
    screen
      .getByRole('button', { name: 'Launch Team' })
      .closest('form') as HTMLFormElement,
  );
}

describe('ContentTeamOrchestratorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaignCreate.mockResolvedValue({ id: 'campaign-1' });
    mocks.goalCreate.mockResolvedValue({ id: 'goal-1' });
    mocks.strategyCreate
      .mockResolvedValueOnce({ id: 'blueprint-writer' })
      .mockResolvedValueOnce({ id: 'blueprint-editor' });
  });

  it('renders the orchestration form with blueprint, brand, and existing strategy context', () => {
    render(<ContentTeamOrchestratorPage />);

    expect(
      screen.getByRole('heading', { name: 'Launch Orchestrator' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Campaign Label')).toBeInTheDocument();
    expect(screen.getByText('Existing Writer')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Launch Pod' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Writer, Editor')).toBeInTheDocument();
  });

  it('validates required campaign data and empty team selections', () => {
    render(<ContentTeamOrchestratorPage />);

    submitForm();
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Campaign label is required.',
    );

    changeField('Campaign Label', 'Launch campaign');
    fireEvent.change(screen.getAllByRole('combobox')[1], {
      target: { value: 'empty-blueprint' },
    });
    submitForm();

    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Select an existing strategy or include a blueprint.',
    );
  });

  it('creates an optional goal, blueprint strategies, and campaign', async () => {
    render(<ContentTeamOrchestratorPage />);

    changeField('Campaign Label', 'Launch campaign');
    changeField('Objective', 'Ship ten launch posts');
    changeField('Shared Budget', '42');
    changeField('Shared Persona', 'Pragmatic operator');
    changeField('Shared Topic', 'AI content systems');
    changeField('Reports To', 'Growth Lead');
    changeField('Company Goal Label', 'May views target');
    changeField('Goal Target', '10000');
    fireEvent.change(screen.getAllByRole('combobox')[3], {
      target: { value: 'posts' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Existing Writer' }),
    );

    submitForm();

    await waitFor(() => {
      expect(mocks.goalCreate).toHaveBeenCalledWith({
        goal: expect.objectContaining({
          brandId: 'brand-1',
          label: 'May views target',
          metric: 'posts',
          targetValue: 10000,
        }),
      });
      expect(mocks.strategyCreate).toHaveBeenCalledTimes(2);
      expect(mocks.campaignCreate).toHaveBeenCalledWith({
        campaign: expect.objectContaining({
          agentIds: [
            'existing-strategy-1',
            'blueprint-writer',
            'blueprint-editor',
          ],
          brief: 'Ship ten launch posts',
          campaignLeadStrategyId: 'existing-strategy-1',
          creditsAllocated: 42,
          label: 'Launch campaign',
        }),
      });
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Content team orchestrator launched',
      );
      expect(mocks.push).toHaveBeenCalledWith('/orchestration');
    });
  });

  it('uses a selected blueprint role as campaign lead and handles submit failures', async () => {
    render(<ContentTeamOrchestratorPage />);

    changeField('Campaign Label', 'Launch campaign');
    fireEvent.change(screen.getAllByRole('combobox')[2], {
      target: { value: 'blueprint:editor' },
    });
    mocks.campaignCreate.mockRejectedValueOnce(new Error('campaign failed'));

    submitForm();

    await waitFor(() => {
      expect(mocks.campaignCreate).toHaveBeenCalledWith({
        campaign: expect.objectContaining({
          campaignLeadStrategyId: 'blueprint-editor',
        }),
      });
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to launch content team orchestrator',
        { error: expect.any(Error) },
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Unable to launch orchestrator',
      );
    });
  });

  it('cancels back to orchestration', () => {
    render(<ContentTeamOrchestratorPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.push).toHaveBeenCalledWith('/orchestration');
  });
});
