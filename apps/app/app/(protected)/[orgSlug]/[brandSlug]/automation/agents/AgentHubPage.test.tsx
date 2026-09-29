import '@testing-library/jest-dom/vitest';
import { AgentType } from '@genfeedai/contracts';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentHubPage from './AgentHubPage';

const mocks = vi.hoisted(() => ({
  addIntent: null as string | null,
  error: vi.fn(),
  getService: vi.fn(),
  getWorkflowBinding: vi.fn(),
  loadError: null as Error | null,
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
    error: mocks.loadError,
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

// Forwards every prop so the real list rows and menus keep their semantics.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children?: ReactNode;
    href: string;
  }) => (
    <a {...props} href={href}>
      {children}
    </a>
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

const MINUTE_MS = 60_000;

/** Healthy and recently run: Your agents + All. */
const HEALTHY_AGENT = {
  agentType: AgentType.IMAGE_CREATOR,
  brand: { id: 'brand-1', label: 'Moonrise', slug: 'moonrise' },
  consecutiveFailures: 0,
  creditsUsedToday: 12,
  dailyCreditBudget: 50,
  id: 'agent-1',
  isActive: true,
  label: 'Image Producer',
  lastRunAt: new Date(Date.now() - MINUTE_MS).toISOString(),
  preferredWorkflowTemplateId: 'founder-editorial-illustration',
};

/** Paused: Needs you (Activate) + All. */
const PAUSED_AGENT = {
  agentType: 'custom_agent',
  consecutiveFailures: 0,
  creditsUsedToday: 0,
  dailyCreditBudget: 10,
  id: 'agent-2',
  isActive: false,
  label: 'Custom Producer',
  lastRunAt: null,
};

/** Active but its last run failed: Needs you (Run now) + All. */
const FAILING_AGENT = {
  agentType: AgentType.VIDEO_CREATOR,
  consecutiveFailures: 2,
  creditsUsedToday: 4,
  dailyCreditBudget: 20,
  id: 'agent-3',
  isActive: true,
  label: 'Video Producer',
  lastRunAt: new Date(Date.now() - 60 * MINUTE_MS).toISOString(),
};

/** Healthy but never run: All only. */
const IDLE_AGENT = {
  agentType: AgentType.ARTICLE_WRITER,
  consecutiveFailures: 0,
  creditsUsedToday: 0,
  dailyCreditBudget: 15,
  id: 'agent-4',
  isActive: true,
  label: 'Article Writer',
  lastRunAt: null,
};

const MORE_ACTIONS = 'More actions';

function getSection(name: 'needs-you' | 'yours' | 'all') {
  return screen.getByTestId(`agent-hub-section-${name}`);
}

/** Every button in a row except the overflow trigger. */
function getVisibleActions(row: HTMLElement) {
  return within(row)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-label') !== MORE_ACTIONS);
}

describe('AgentHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.addIntent = null;
    mocks.isLoading = false;
    mocks.loadError = null;
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

  it('shows list skeletons inside All while loading, then the empty state', async () => {
    mocks.isLoading = true;
    const { rerender } = render(<AgentHubPage />);

    expect(screen.getByText('Agents')).toBeVisible();
    expect(
      screen.getByText(
        'Content agents that fill workflow prompts and assets, then run deterministic graphs.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add agent' })).toBeVisible();

    const all = getSection('all');
    expect(all).toHaveAttribute('aria-busy', 'true');
    expect(within(all).getByTestId('list-rows-skeleton')).toBeInTheDocument();
    expect(
      screen.queryByTestId('agent-hub-section-needs-you'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('agent-hub-section-yours'),
    ).not.toBeInTheDocument();

    mocks.isLoading = false;
    rerender(<AgentHubPage />);
    expect(screen.getByText('No agents yet')).toBeVisible();
    expect(screen.getByText('Add your first agent')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Add agent' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('agent-hub-section-all'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add your first agent' }),
    );
    expect(screen.getByText('Add agent dialog (library)')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Finish add agent' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('replaces All with a retryable error when the list fails to load', () => {
    mocks.loadError = new Error('Network down');

    render(<AgentHubPage />);

    const all = getSection('all');
    expect(within(all).getByRole('alert')).toHaveTextContent(
      "Agents couldn't load.",
    );
    expect(within(all).queryByRole('radio', { name: 'Grid' })).toBeNull();
    expect(screen.queryByText('No agents yet')).not.toBeInTheDocument();

    fireEvent.click(within(all).getByRole('button', { name: 'Retry' }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('orders sections Needs you, Your agents, All and fills each from intent', () => {
    mocks.strategies = [HEALTHY_AGENT, PAUSED_AGENT, FAILING_AGENT, IDLE_AGENT];

    render(<AgentHubPage />);

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Needs you2', 'Your agents', 'All4']);

    expect(
      within(getSection('needs-you'))
        .getAllByTestId(/^agent-row-needsYou-/)
        .map((row) => row.getAttribute('data-testid')),
    ).toEqual(['agent-row-needsYou-agent-2', 'agent-row-needsYou-agent-3']);
    expect(
      within(getSection('yours'))
        .getAllByTestId(/^agent-row-yours-/)
        .map((row) => row.getAttribute('data-testid')),
    ).toEqual(['agent-row-yours-agent-1']);
    expect(
      within(getSection('all')).getAllByTestId(/^agent-row-all-/),
    ).toHaveLength(4);
  });

  it('shows exactly one visible action per row, resolving Needs you inline', () => {
    mocks.strategies = [HEALTHY_AGENT, PAUSED_AGENT, FAILING_AGENT, IDLE_AGENT];

    render(<AgentHubPage />);

    const rows = screen.getAllByTestId(/^agent-row-/);
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(getVisibleActions(row)).toHaveLength(1);
      expect(
        within(row).getByRole('button', { name: MORE_ACTIONS }),
      ).toBeInTheDocument();
    }

    const pausedNeedsYou = screen.getByTestId('agent-row-needsYou-agent-2');
    expect(getVisibleActions(pausedNeedsYou)[0]).toHaveAccessibleName(
      'Activate',
    );
    const failingNeedsYou = screen.getByTestId('agent-row-needsYou-agent-3');
    expect(getVisibleActions(failingNeedsYou)[0]).toHaveAccessibleName(
      'Run now',
    );
    // Outside Needs you every agent leads with Run now, paused ones included.
    expect(
      getVisibleActions(screen.getByTestId('agent-row-all-agent-2'))[0],
    ).toHaveAccessibleName('Run now');
  });

  it('writes one fact line per agent and links the name to its scoped detail page', () => {
    mocks.strategies = [
      HEALTHY_AGENT,
      PAUSED_AGENT,
      FAILING_AGENT,
      { ...FAILING_AGENT, id: 'agent-5', isActive: false, label: 'Stalled' },
    ];

    render(<AgentHubPage />);

    const healthy = screen.getByTestId('agent-row-all-agent-1');
    expect(healthy).toHaveTextContent(
      'Image Creator · Brand: Moonrise · Ran 1 minute ago · 12 / 50 credits today · Workflow: founder-editorial-illustration',
    );
    expect(
      within(healthy).getByRole('link', { name: 'Image Producer' }),
    ).toHaveAttribute('href', '/org-one/brand-one/automation/agents/agent-1');

    // Healthy agents carry no status badge.
    expect(healthy).not.toHaveTextContent(/Paused|Last run failed/);

    // Empty fields are omitted, never rendered as placeholders; the reason an
    // agent needs you is a labelled status badge ahead of the facts.
    const paused = screen.getByTestId('agent-row-all-agent-2');
    expect(within(paused).getByText('Paused')).toBeVisible();
    expect(
      within(paused).getByText('custom_agent · 0 / 10 credits today'),
    ).toBeVisible();
    expect(paused).not.toHaveTextContent('Never');
    expect(paused).not.toHaveTextContent('Workflow:');

    const failing = screen.getByTestId('agent-row-needsYou-agent-3');
    expect(within(failing).getByText('Last run failed')).toBeVisible();
    expect(within(failing).getByText('Ran about 1 hour ago')).toBeVisible();

    const yours = screen.getByTestId('agent-row-yours-agent-1');
    expect(within(yours).getByText('Ran 1 minute ago')).toBeVisible();

    const stalled = screen.getByTestId('agent-row-needsYou-agent-5');
    expect(
      within(stalled).getByText('Paused after 2 failed runs'),
    ).toBeVisible();
  });

  it('defaults All to a list and switches to a remembered three-column grid of flat cards', () => {
    mocks.strategies = [HEALTHY_AGENT, IDLE_AGENT];

    render(<AgentHubPage />);

    const all = getSection('all');
    expect(within(all).getByRole('radio', { name: 'List' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(all).getAllByTestId(/^agent-row-all-/)).toHaveLength(2);
    expect(within(all).queryAllByTestId(/^agent-card-/)).toHaveLength(0);

    fireEvent.click(within(all).getByRole('radio', { name: 'Grid' }));

    expect(within(all).queryAllByTestId(/^agent-row-all-/)).toHaveLength(0);
    const grid = within(all).getByTestId('agent-hub-collection')
      .firstElementChild as HTMLElement;
    expect(grid.className).toContain('@[60rem]:grid-cols-3');
    expect(grid.className).not.toContain('grid-cols-4');
    expect(
      window.localStorage.getItem('genfeed:collection-view:automation.agents'),
    ).toBe('grid');

    const card = within(all).getByTestId('agent-card-agent-1');
    expect(card).toHaveClass('rounded-card', 'shadow-border');
    expect(card.className).not.toMatch(
      /(^|\s)(rounded|rounded-lg|rounded-2xl|bg-secondary|gen-glass\S*|hover:bg-accent)(\s|$)/,
    );
    expect(card.querySelector('.bg-secondary, .bg-muted')).toBeNull();
    expect(getVisibleActions(card)).toHaveLength(1);
    expect(getVisibleActions(card)[0]).toHaveAccessibleName('Run now');
  });

  it('keeps secondary actions in a real keyboard-reachable overflow menu', async () => {
    const user = userEvent.setup();
    mocks.strategies = [HEALTHY_AGENT];

    render(<AgentHubPage />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Run workflow')).not.toBeInTheDocument();

    const row = screen.getByTestId('agent-row-all-agent-1');
    const trigger = within(row).getByRole('button', { name: MORE_ACTIONS });
    trigger.focus();
    await user.keyboard('{Enter}');

    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Run workflow', 'Pause']);

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(
      await screen.findByRole('menuitem', { name: 'Run workflow' }),
    );
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

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Pause' }));
    await waitFor(() => {
      expect(mocks.setActive).toHaveBeenCalledWith('agent-1', false);
    });
    expect(mocks.success).toHaveBeenCalledWith('Agent status updated');
  });

  it('runs and activates a paused agent from Needs you', async () => {
    const user = userEvent.setup();
    mocks.strategies = [PAUSED_AGENT];

    render(<AgentHubPage />);

    const row = screen.getByTestId('agent-row-needsYou-agent-2');
    await user.click(within(row).getByRole('button', { name: MORE_ACTIONS }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Run now', 'Run workflow']);

    await user.click(within(menu).getByRole('menuitem', { name: 'Run now' }));
    await waitFor(() => {
      expect(mocks.runNow).toHaveBeenCalledWith('agent-2');
    });
    expect(mocks.success).toHaveBeenCalledWith('Agent run triggered');

    await user.click(within(row).getByRole('button', { name: 'Activate' }));
    await waitFor(() => {
      expect(mocks.setActive).toHaveBeenCalledWith('agent-2', true);
    });
  });

  it('reports toggle and run failures', async () => {
    mocks.strategies = [
      { ...FAILING_AGENT, consecutiveFailures: 0, isActive: false },
    ];
    mocks.runNow.mockRejectedValueOnce(new Error('run failed'));
    mocks.setActive.mockRejectedValueOnce(new Error('toggle failed'));

    render(<AgentHubPage />);

    fireEvent.click(
      within(screen.getByTestId('agent-row-all-agent-3')).getByRole('button', {
        name: 'Run now',
      }),
    );
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to trigger agent run',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
    expect(mocks.error).toHaveBeenCalledWith('Failed to trigger run');

    fireEvent.click(
      within(screen.getByTestId('agent-row-needsYou-agent-3')).getByRole(
        'button',
        { name: 'Activate' },
      ),
    );
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to toggle agent',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
    expect(mocks.error).toHaveBeenCalledWith('Failed to update agent status');
  });
});
