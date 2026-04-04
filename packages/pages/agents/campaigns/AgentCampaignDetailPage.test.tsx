import AgentCampaignDetailPage from '@pages/agents/campaigns/AgentCampaignDetailPage';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const pushMock = vi.fn();
const getByIdMock = vi.fn();
const getStatusMock = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({
    execute: vi.fn(),
    getById: getByIdMock,
    getStatus: getStatusMock,
    pause: vi.fn(),
    update: vi.fn(),
  })),
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({
    id: 'campaign-123',
  })),
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
    warn: vi.fn(),
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
    description?: string;
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      {description ? <p>{description}</p> : null}
      {right}
      {children}
    </section>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label, onClick }: { label: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({ onClick }: { onClick?: () => void }) => (
    <button onClick={onClick}>Refresh</button>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/kpi/kpi-section/KPISection', () => ({
  default: ({
    items,
    title,
  }: {
    items: Array<{ label: string; value: string | number }>;
    title: string;
  }) => (
    <section>
      <h2>{title}</h2>
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <span>{item.value}</span>
        </div>
      ))}
    </section>
  ),
}));

describe('AgentCampaignDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getByIdMock.mockResolvedValue({
      agents: ['agent-1', 'agent-2'],
      brief: 'Launch content push',
      contentQuota: null,
      creditsAllocated: 1000,
      creditsUsed: 250,
      id: 'campaign-123',
      label: 'Spring Launch',
      status: 'active',
    });
    getStatusMock.mockResolvedValue({
      agentsRunning: 2,
      contentProduced: 8,
    });
  });

  it('renders campaign details after loading', async () => {
    render(<AgentCampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Spring Launch')).toBeInTheDocument();
    });

    expect(screen.getByText('Campaign Overview')).toBeInTheDocument();
    expect(screen.getByText('Agents Running')).toBeInTheDocument();
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('agent-2')).toBeInTheDocument();
  });
});
