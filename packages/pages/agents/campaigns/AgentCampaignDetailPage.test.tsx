import AgentCampaignDetailPage from '@pages/agents/campaigns/AgentCampaignDetailPage';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const pushMock = vi.fn();
const getByIdMock = vi.fn();
const getStatusMock = vi.fn();
let brandContext = {
  brandId: 'brand-123',
  isReady: true,
  organizationId: 'org-123',
};

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => brandContext),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: vi.fn(() => ({
    isLoading: false,
    strategies: [
      { agentType: 'writer', id: 'agent-1', label: 'Script Writer' },
      { agentType: 'video_creator', id: 'agent-2', label: 'Short Creator' },
    ],
  })),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/demo${path}` }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

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
  usePathname: () => '/',
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

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    label,
    onClick,
  }: {
    ariaLabel?: string;
    label: ReactNode;
    onClick?: () => void;
  }) => (
    <button aria-label={ariaLabel} onClick={onClick}>
      {label}
    </button>
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
    brandContext = {
      brandId: 'brand-123',
      isReady: true,
      organizationId: 'org-123',
    };
    getByIdMock.mockResolvedValue({
      agents: ['agent-1', 'agent-2'],
      brandId: 'brand-123',
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

    expect(screen.getByText('Program Overview')).toBeInTheDocument();
    expect(screen.getByText('Agents Running')).toBeInTheDocument();
    expect(screen.getByText('Script Writer')).toBeInTheDocument();
    expect(screen.getByText('Short Creator')).toBeInTheDocument();
    expect(screen.getByText('agent-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Programs' }));
    expect(pushMock).toHaveBeenCalledWith('/acme/demo/automation/campaigns');
  });

  it('does not render a Program from another selected brand', async () => {
    getByIdMock.mockResolvedValue({
      agents: ['agent-1'],
      brandId: 'brand-other',
      creditsAllocated: 100,
      creditsUsed: 0,
      id: 'campaign-123',
      label: 'Other Brand Program',
      status: 'draft',
    });

    render(<AgentCampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Program Not Found')).toBeInTheDocument();
    });
    expect(screen.queryByText('Other Brand Program')).not.toBeInTheDocument();
    expect(getStatusMock).not.toHaveBeenCalled();
  });

  it('ignores a stale Program response after the selected brand changes', async () => {
    let resolveFirstRequest: (campaign: Record<string, unknown>) => void = () =>
      undefined;
    const firstRequest = new Promise<Record<string, unknown>>((resolve) => {
      resolveFirstRequest = resolve;
    });

    getByIdMock.mockReset();
    getByIdMock.mockReturnValueOnce(firstRequest).mockResolvedValueOnce({
      agents: ['agent-2'],
      brandId: 'brand-456',
      creditsAllocated: 100,
      creditsUsed: 0,
      id: 'campaign-123',
      label: 'Brand B Program',
      status: 'draft',
    });

    const { rerender } = render(<AgentCampaignDetailPage />);

    brandContext = {
      brandId: 'brand-456',
      isReady: true,
      organizationId: 'org-123',
    };
    rerender(<AgentCampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Brand B Program')).toBeInTheDocument();
    });

    await act(async () => {
      resolveFirstRequest({
        agents: ['agent-1'],
        brandId: 'brand-123',
        creditsAllocated: 100,
        creditsUsed: 0,
        id: 'campaign-123',
        label: 'Brand A Program',
        status: 'draft',
      });
      await firstRequest;
    });

    expect(screen.getByText('Brand B Program')).toBeInTheDocument();
    expect(screen.queryByText('Brand A Program')).not.toBeInTheDocument();
  });
});
