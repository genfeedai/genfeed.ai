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
const executeMock = vi.fn();
const pauseMock = vi.fn();
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

const campaignsServiceMock = {
  execute: executeMock,
  getById: getByIdMock,
  getStatus: getStatusMock,
  pause: pauseMock,
  update: vi.fn(),
};
const resolveCampaignsService = async () => campaignsServiceMock;

// `useAuthedService` returns a `useCallback`-stable resolver; minting a new
// async function per render invalidates consumer callbacks and re-fires their
// effects on every commit.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => resolveCampaignsService),
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

// The real service is a singleton. Returning a fresh object per call makes
// every consumer callback that depends on it unstable, which re-fires their
// effects on each render.
vi.mock('@services/core/notifications.service', () => {
  const service = { error: vi.fn(), success: vi.fn() };

  return { NotificationsService: { getInstance: vi.fn(() => service) } };
});

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
    isDisabled,
  }: {
    ariaLabel?: string;
    label: ReactNode;
    onClick?: () => void;
    isDisabled?: boolean;
  }) => (
    <button aria-label={ariaLabel} disabled={isDisabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

// Flattened like the other collection-actions consumers: the real Radix
// dropdown needs pointer events jsdom does not implement.
vi.mock('@ui/collection/CollectionItemActions', () => ({
  default: ({
    primary,
    overflow,
  }: {
    primary?: ReactNode;
    overflow: Array<{ id: string; label: string; onSelect?: () => void }>;
  }) => (
    <div data-testid="header-actions">
      {primary}
      {overflow.map((action) => (
        <button key={action.id} onClick={action.onSelect} type="button">
          {action.label}
        </button>
      ))}
    </div>
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
      startDate: '2026-03-01T00:00:00.000Z',
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

  it('shows exactly one primary action — Pause — for a running program, with Complete in overflow', async () => {
    render(<AgentCampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Spring Launch')).toBeInTheDocument();
    });

    const actions = screen.getByTestId('header-actions');
    expect(actions).toHaveTextContent('Pause');
    expect(actions).toHaveTextContent('Complete');
    expect(screen.queryByText('Start')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(pauseMock).toHaveBeenCalledWith('campaign-123'));
  });

  it('shows Resume as the primary action for a paused program and surfaces it in Needs you', async () => {
    getByIdMock.mockResolvedValue({
      agents: ['agent-1'],
      brandId: 'brand-123',
      creditsAllocated: 100,
      creditsUsed: 0,
      id: 'campaign-123',
      label: 'Autumn Pause',
      startDate: '2026-03-01T00:00:00.000Z',
      status: 'paused',
    });

    render(<AgentCampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Autumn Pause')).toBeInTheDocument();
    });

    expect(screen.getByTestId('header-actions')).toHaveTextContent('Resume');
    expect(
      screen.getByRole('heading', { name: 'Needs you' }),
    ).toBeInTheDocument();

    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    fireEvent.click(resumeButtons[resumeButtons.length - 1]);
    await waitFor(() =>
      expect(executeMock).toHaveBeenCalledWith('campaign-123'),
    );
  });

  it('guards against a duplicate paid run from two rapid clicks on Resume', async () => {
    getByIdMock.mockResolvedValue({
      agents: ['agent-1'],
      brandId: 'brand-123',
      creditsAllocated: 100,
      creditsUsed: 0,
      id: 'campaign-123',
      label: 'Autumn Pause',
      startDate: '2026-03-01T00:00:00.000Z',
      status: 'paused',
    });
    let resolveExecute: (() => void) | undefined;
    executeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveExecute = resolve;
        }),
    );

    render(<AgentCampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Autumn Pause')).toBeInTheDocument();
    });

    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    const needsYouResume = resumeButtons[resumeButtons.length - 1];

    // Two clicks in the same tick, before any re-render can disable the
    // button — the reentrancy guard, not the disabled attribute, must stop
    // the second call.
    fireEvent.click(needsYouResume);
    fireEvent.click(needsYouResume);

    expect(executeMock).toHaveBeenCalledTimes(1);
    resolveExecute?.();
    executeMock.mockImplementation(() => Promise.resolve());
  });

  it('disables Resume in Needs you while an execution is already running', async () => {
    getByIdMock.mockResolvedValue({
      agents: ['agent-1'],
      brandId: 'brand-123',
      creditsAllocated: 100,
      creditsUsed: 0,
      id: 'campaign-123',
      label: 'Autumn Pause',
      startDate: '2026-03-01T00:00:00.000Z',
      status: 'paused',
    });
    let resolveExecute: (() => void) | undefined;
    executeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveExecute = resolve;
        }),
    );

    render(<AgentCampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Autumn Pause')).toBeInTheDocument();
    });

    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    fireEvent.click(resumeButtons[resumeButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: 'Resume' })[
          resumeButtons.length - 1
        ],
      ).toBeDisabled();
    });
    resolveExecute?.();
    executeMock.mockImplementation(() => Promise.resolve());
  });

  it('hides Needs you and shows no primary action once the program is completed', async () => {
    getByIdMock.mockResolvedValue({
      agents: ['agent-1'],
      brandId: 'brand-123',
      creditsAllocated: 100,
      creditsUsed: 100,
      id: 'campaign-123',
      label: 'Wrapped Up',
      startDate: '2026-03-01T00:00:00.000Z',
      status: 'completed',
    });

    render(<AgentCampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Wrapped Up')).toBeInTheDocument();
    });

    expect(screen.getByTestId('header-actions')).toBeEmptyDOMElement();
    expect(
      screen.queryByRole('heading', { name: 'Needs you' }),
    ).not.toBeInTheDocument();
  });

  it('renders the known lifecycle facts on one line, omitting the absent end date', async () => {
    render(<AgentCampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Spring Launch')).toBeInTheDocument();
    });

    const factLine = screen.getByTestId('record-fact-line');
    expect(factLine).toHaveTextContent('Status');
    expect(factLine).toHaveTextContent('Active');
    expect(factLine).not.toHaveTextContent('Ends');
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

    // The load resolves the service before it calls `getById`, so the first
    // request is only in flight after a microtask. Switching brands earlier
    // makes the second load consume the pending promise and hang the page.
    await waitFor(() => {
      expect(getByIdMock).toHaveBeenCalledTimes(1);
    });

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
