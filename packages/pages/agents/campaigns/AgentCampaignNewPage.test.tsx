import AgentCampaignNewPage from '@pages/agents/campaigns/AgentCampaignNewPage';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

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
  useRouter: vi.fn(() => ({
    push: pushMock,
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

vi.mock('@ui/inputs/textarea/Textarea', () => ({
  default: ({
    label,
    onChange,
    value,
  }: {
    label: string;
    onChange: (event: { target: { value: string } }) => void;
    value: string;
  }) => (
    <label>
      <span>{label}</span>
      <textarea
        aria-label={label}
        onChange={(event) =>
          onChange({ target: { value: event.target.value } })
        }
        value={value}
      />
    </label>
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

    expect(screen.getByText('New Campaign')).toBeInTheDocument();
    expect(screen.getByLabelText('Campaign Label *')).toBeInTheDocument();
    expect(screen.getByText('Create Campaign')).toBeInTheDocument();
    expect(
      screen.getByText('No agent strategies available. Create agents first.'),
    ).toBeInTheDocument();
  });
});
