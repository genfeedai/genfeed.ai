import '@testing-library/jest-dom/vitest';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentWizardPage from './AgentWizardPage';

const mocks = vi.hoisted(() => ({
  brands: [
    {
      agentConfig: {
        autoPublish: {
          confidenceThreshold: 0.9,
          enabled: true,
        },
        defaultModel: 'deepseek/deepseek-chat',
        persona: 'Pragmatic founder operator',
        strategy: {
          contentTypes: ['launch notes', 'product stories'],
          frequency: 'Every 6 hours',
          platforms: ['linkedin', 'youtube'],
        },
        voice: {
          audience: ['founders', 'operators'],
          style: 'direct',
          tone: 'sharp',
        },
      },
      id: 'brand-1',
      label: 'Moonrise Studio',
    },
  ] as Array<Record<string, unknown>>,
  create: vi.fn(),
  getService: vi.fn(),
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: mocks.brands,
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
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
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
      {description && <p>{description}</p>}
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    label,
    onClick,
    type = 'button',
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button type={type} disabled={isDisabled} onClick={onClick}>
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
    onCheckedChange: (value: boolean) => void;
  }) => (
    <button
      aria-label={ariaLabel}
      type="button"
      onClick={() => onCheckedChange(!checked)}
    >
      {checked ? 'checked' : 'unchecked'}
    </button>
  ),
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
    onChange: (event: { target: { value: string } }) => void;
    placeholder?: string;
    type?: string;
    value: string | number;
  }) => (
    <input
      id={id}
      placeholder={placeholder}
      type={type}
      value={value}
      onChange={(event) => onChange(event)}
    />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
  }) => (
    <div>
      {children}
      <button type="button" onClick={() => onValueChange('brand-1')}>
        Select Brand One
      </button>
      <button
        type="button"
        onClick={() => onValueChange(AgentRunFrequency.TWICE_DAILY)}
      >
        Select Twice Daily
      </button>
      <button type="button" onClick={() => onValueChange('high_quality')}>
        Select High Quality
      </button>
    </div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: ({
    id,
    onChange,
    placeholder,
    value,
  }: {
    id?: string;
    onChange: (event: { target: { value: string } }) => void;
    placeholder?: string;
    value: string;
  }) => (
    <textarea
      id={id}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event)}
    />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

function getReviewButton() {
  return screen
    .getAllByRole('button', { name: /Review/i })
    .find((button) => button.textContent?.trim().startsWith('Review'));
}

describe('AgentWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brands = [
      {
        agentConfig: {
          autoPublish: {
            confidenceThreshold: 0.9,
            enabled: true,
          },
          defaultModel: 'deepseek/deepseek-chat',
          persona: 'Pragmatic founder operator',
          strategy: {
            contentTypes: ['launch notes', 'product stories'],
            frequency: 'Every 6 hours',
            platforms: ['linkedin', 'youtube'],
          },
          voice: {
            audience: ['founders', 'operators'],
            style: 'direct',
            tone: 'sharp',
          },
        },
        id: 'brand-1',
        label: 'Moonrise Studio',
      },
    ];
    mocks.create.mockResolvedValue({ id: 'agent-1' });
    mocks.getService.mockResolvedValue({
      create: mocks.create,
    });
  });

  it('creates an agent from selected type, brand defaults, and review settings', async () => {
    render(<AgentWizardPage />);

    expect(
      screen.getByRole('heading', { name: 'New Agent' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Video Creator/i }));
    fireEvent.click(screen.getByRole('button', { name: /Pick Brand/i }));
    expect(
      screen.getByText(/Choose a brand to auto-fill voice/),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Select Brand One' })[0],
    );
    fireEvent.click(screen.getByRole('button', { name: /Configure/i }));

    expect(
      screen.getByDisplayValue('deepseek/deepseek-chat'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Tone: sharp/)).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('launch notes, product stories'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Auto-publish Confidence Threshold'),
    ).toHaveValue(0.9);

    fireEvent.change(screen.getByLabelText('Agent Label'), {
      target: { value: 'Launch Video Agent' },
    });
    fireEvent.change(screen.getByLabelText('Topics'), {
      target: { value: 'launches, demos, founder updates' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Select Twice Daily' })[0],
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Select High Quality' })[1],
    );
    fireEvent.change(screen.getByLabelText('Daily Credit Budget'), {
      target: { value: '750' },
    });
    fireEvent.change(screen.getByLabelText('Min Credit Threshold'), {
      target: { value: '125' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    fireEvent.click(getReviewButton() as HTMLButtonElement);

    expect(screen.getByText('Launch Video Agent')).toBeInTheDocument();
    expect(screen.getByText('Moonrise Studio')).toBeInTheDocument();
    expect(screen.getByText('Video Creator')).toBeInTheDocument();
    expect(screen.getByText('tiktok, youtube')).toBeInTheDocument();
    expect(screen.getByText('750 credits')).toBeInTheDocument();
    expect(screen.getByText('Auto-Publish')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Start immediately after creation'));
    fireEvent.click(screen.getByRole('button', { name: /Create Agent/i }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: AgentType.VIDEO_CREATOR,
          autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
          autoPublishConfidenceThreshold: 0.9,
          dailyCreditBudget: 750,
          isActive: false,
          label: 'Launch Video Agent',
          minCreditThreshold: 125,
          platforms: ['tiktok', 'youtube'],
          runFrequency: AgentRunFrequency.TWICE_DAILY,
          topics: ['launches', 'demos', 'founder updates'],
        }),
      );
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Agent created successfully',
      );
      expect(mocks.push).toHaveBeenCalledWith('/orchestration');
    });
  });

  it('supports manual configuration without brands and reports create failures', async () => {
    mocks.brands = [];
    mocks.create.mockRejectedValueOnce(new Error('create failed'));
    render(<AgentWizardPage />);

    fireEvent.click(screen.getByRole('button', { name: /Pick Brand/i }));
    expect(screen.getByText(/No brands found/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Configure/i }));
    expect(getReviewButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Agent Label'), {
      target: { value: 'Manual Agent' },
    });
    fireEvent.change(screen.getByLabelText('Topics'), {
      target: { value: 'one, , two' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Auto-Publish/ }));
    fireEvent.change(
      screen.getByLabelText('Auto-publish Confidence Threshold'),
      {
        target: { value: '0.85' },
      },
    );
    fireEvent.click(getReviewButton() as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: /Create Agent/i }));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith('Failed to create agent', {
        error: expect.any(Error),
      });
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to create agent',
      );
    });
  });
});
