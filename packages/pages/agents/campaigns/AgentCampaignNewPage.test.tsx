import AgentCampaignNewPage from '@pages/agents/campaigns/AgentCampaignNewPage';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const pushMock = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: vi.fn(() => ({
    strategies: [],
  })),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: vi.fn(() => ({
    push: pushMock,
  })),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      agentStrategies: 'Agent Strategies',
      brief: 'Brief',
      campaignLabel: 'Campaign Label *',
      creditsAllocated: 'Credits Allocated',
      endDate: 'End Date (optional)',
      noAgentStrategies: 'No agent strategies available. Create agents first.',
      startDate: 'Start Date *',
      'status.active': 'Active',
      'status.draft': 'Draft',
      'status.label': 'Status',
    })[key] ?? key,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
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
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    label,
    onClick,
    type,
  }: {
    label: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button onClick={onClick} type={type}>
      {label}
    </button>
  ),
}));

vi.mock('@ui/primitives/label', () => ({
  Label: ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: ({
    id,
    onChange,
    value,
  }: {
    id?: string;
    onChange?: (event: { target: { value: string } }) => void;
    value?: string;
  }) => (
    <textarea
      aria-label={id}
      id={id}
      onChange={(event) =>
        onChange?.({ target: { value: event.target.value } })
      }
      value={value}
    />
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    id,
    onChange,
    type = 'text',
    value,
  }: {
    id?: string;
    onChange?: (event: { target: { value: string } }) => void;
    type?: string;
    value?: string;
  }) => (
    <input
      id={id}
      onChange={(event) =>
        onChange?.({ target: { value: event.target.value } })
      }
      type={type}
      value={value}
    />
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
    onCheckedChange?: () => void;
  }) => (
    <input
      aria-label={ariaLabel}
      checked={checked}
      onChange={() => onCheckedChange?.()}
      type="checkbox"
    />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

describe('AgentCampaignNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the new campaign form shell', () => {
    render(<AgentCampaignNewPage />);

    expect(screen.getByText('New Program')).toBeInTheDocument();
    expect(screen.getByLabelText('Campaign Label *')).toBeInTheDocument();
    expect(screen.getByText('Create Program')).toBeInTheDocument();
    expect(
      screen.getByText('No agent strategies available. Create agents first.'),
    ).toBeInTheDocument();
  });
});
