import '@testing-library/jest-dom/vitest';
import { translateFromCatalog } from '@app-tests/next-intl.stub';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import {
  buildSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@genfeedai/contracts/interfaces';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowsPage from './workflows-page';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  delete: vi.fn(),
  findAllPages: vi.fn(),
  replace: vi.fn(),
  listSystemCatalog: vi.fn(),
  getters: new Map<string, () => Promise<unknown>>(),
  list: vi.fn(),
  openConfirmDelete: vi.fn(),
  pin: vi.fn(),
  reorder: vi.fn(),
  unpin: vi.fn(),
}));

/** Stable translator per namespace, like next-intl's memoized hook. */
const translators = vi.hoisted(
  () => new Map<string, ReturnType<typeof translateFromCatalog>>(),
);

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    let translator = translators.get(namespace);
    if (!translator) {
      translator = translateFromCatalog(namespace);
      translators.set(namespace, translator);
    }
    return translator;
  },
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

/** One stable getter per service factory, like the real hook. */
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const key = factory.toString();
    let getter = mocks.getters.get(key);
    if (!getter) {
      getter = async () => factory('token');
      mocks.getters.set(key, getter);
    }
    return getter;
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/automation/workflows',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@services/automation/workflows.service', () => ({
  WorkflowsService: {
    getInstance: () => ({
      delete: mocks.delete,
      findAllPages: mocks.findAllPages,
    }),
  },
}));

vi.mock('@/features/workflows/services/workflow-api', () => ({
  createWorkflowApiService: () => ({
    listSystemCatalog: mocks.listSystemCatalog,
  }),
}));

vi.mock('@services/admin/featured-workflows.service', () => ({
  AdminFeaturedWorkflowsService: {
    getInstance: () => ({
      list: mocks.list,
      pin: mocks.pin,
      reorder: mocks.reorder,
      unpin: mocks.unpin,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

const notificationsService = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

/** A singleton, like the real service. */
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notificationsService },
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmDeleteModal: () => ({
      openConfirmDelete: mocks.openConfirmDelete,
    }),
  }),
);

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, label }: { children?: ReactNode; label: string }) => (
    <main aria-label={label}>{children}</main>
  ),
}));

vi.mock('@components/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: () => <span>date</span>,
}));

const TENANT_WORKFLOW = {
  createdAt: '2026-09-01T00:00:00.000Z',
  id: 'wf-tenant',
  label: 'Launch thread',
  status: 'active',
  trigger: 'manual',
};
const PINNED_WORKFLOW = {
  id: 'wf-pinned',
  label: 'Founder thread',
  status: 'active',
};
const SYSTEM_WORKFLOW = {
  id: 'wf-system',
  label: 'Daily digest',
  metadata: {
    [SYSTEM_WORKFLOW_METADATA_KEY]: buildSystemWorkflowMetadata({
      canonicalId: 'daily-digest',
    }),
  },
  status: 'active',
};

function pinSummary(id: string, label: string, featuredRank: number) {
  return { description: null, featuredRank, id, label, thumbnail: null };
}

const PINS = [
  pinSummary('wf-pinned', 'Founder thread', 1),
  pinSummary('wf-foreign', 'Another org workflow', 2),
];

/** The heading carries the pin count, e.g. "Featured 2". */
function featuredSection() {
  return screen.getByRole('region', { name: /^Featured/ });
}

function workflowsTable() {
  return screen.getByRole('table', { name: 'Workflows' });
}

/** Names of the rows on the current page, header excluded. */
function renderedLabels() {
  return within(workflowsTable())
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent ?? '');
}

function workflowRow(label: string) {
  const row = within(workflowsTable())
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(label));
  if (!row) {
    throw new Error(`${label} row not rendered`);
  }
  return row;
}

const CATALOG = [
  {
    canonicalId: 'daily-trends-digest',
    category: 'product',
    changeSummary: '',
    description: 'A digest of what is trending',
    family: 'product',
    installable: true,
    installed: true,
    installedWorkflowId: 'wf-system',
    isScheduleEnabled: true,
    label: 'Daily Trends Digest',
    schedule: '0 8 * * *',
    sourceIssue: 1,
    version: 2,
  },
  {
    canonicalId: 'ad-optimizer',
    category: 'ads',
    changeSummary: '',
    description: 'Tunes ad spend',
    family: 'ad-automation',
    installable: true,
    installed: false,
    installedWorkflowId: null,
    isScheduleEnabled: false,
    label: 'Ad optimizer',
    sourceIssue: 2,
    version: 1,
  },
];

async function clickRowAction(label: string, action: string) {
  const user = userEvent.setup();
  await user.click(
    within(workflowRow(label)).getByRole('button', { name: action }),
  );
  return user;
}

async function renderLoadedPage() {
  render(<WorkflowsPage />, { wrapper: queryClientWrapper() });
  await screen.findByText('Launch thread');
}

describe('Admin workflows page Featured pins (#5511)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.getters.clear();
    mocks.findAllPages.mockResolvedValue([
      TENANT_WORKFLOW,
      PINNED_WORKFLOW,
      SYSTEM_WORKFLOW,
    ]);
    mocks.list.mockResolvedValue(PINS);
    mocks.listSystemCatalog.mockResolvedValue(CATALOG);
  });

  it('requests every workflow once, with system copies included', async () => {
    await renderLoadedPage();

    expect(mocks.findAllPages).toHaveBeenCalledWith(
      { includeSystem: true },
      expect.any(AbortSignal),
    );
  });

  it('passes the search to the API', async () => {
    mocks.searchParams = new URLSearchParams('q=digest');

    await renderLoadedPage();

    expect(mocks.findAllPages).toHaveBeenCalledWith(
      { includeSystem: true, search: 'digest' },
      expect.any(AbortSignal),
    );
  });

  describe('pagination', () => {
    const MANY = Array.from({ length: 20 }, (_, index) => ({
      createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      id: `wf-${index + 1}`,
      label: `Workflow ${String(index + 1).padStart(2, '0')}`,
      status: 'active',
    }));

    beforeEach(() => {
      mocks.findAllPages.mockResolvedValue(MANY);
      mocks.listSystemCatalog.mockResolvedValue([]);
    });

    it('shows one page of rows, newest first, with the total', async () => {
      render(<WorkflowsPage />, { wrapper: queryClientWrapper() });
      await screen.findByText('Workflow 20');

      expect(renderedLabels()).toHaveLength(ITEMS_PER_PAGE);
      expect(renderedLabels()[0]).toContain('Workflow 20');
      expect(screen.getByText('20 workflows')).toBeVisible();
    });

    it('shows the remaining rows on page 2', async () => {
      mocks.searchParams = new URLSearchParams('page=2');
      render(<WorkflowsPage />, { wrapper: queryClientWrapper() });
      await screen.findByText('Workflow 05');

      expect(renderedLabels()).toEqual([
        expect.stringContaining('Workflow 05'),
        expect.stringContaining('Workflow 04'),
        expect.stringContaining('Workflow 03'),
        expect.stringContaining('Workflow 02'),
        expect.stringContaining('Workflow 01'),
      ]);
    });

    it('goes to the next page through the URL', async () => {
      const user = userEvent.setup();
      render(<WorkflowsPage />, { wrapper: queryClientWrapper() });
      await screen.findByText('Workflow 20');

      await user.click(screen.getByRole('link', { name: /next/i }));

      expect(mocks.replace).toHaveBeenCalledWith(
        '/admin/automation/workflows?page=2',
        { scroll: false },
      );
    });

    it('falls back to the last page when ?page= is past the end', async () => {
      mocks.searchParams = new URLSearchParams('page=9');
      render(<WorkflowsPage />, { wrapper: queryClientWrapper() });
      await screen.findByText('Workflow 01');

      expect(renderedLabels()).toHaveLength(5);
    });
  });

  it('sorts by a column from the URL', async () => {
    mocks.searchParams = new URLSearchParams('sort=-label');

    await renderLoadedPage();

    expect(renderedLabels()).toEqual([
      expect.stringContaining('Launch thread'),
      expect.stringContaining('Founder thread'),
      expect.stringContaining('Daily digest'),
      expect.stringContaining('Ad optimizer'),
    ]);
  });

  it('ignores a sort on a column the table cannot order by', async () => {
    mocks.searchParams = new URLSearchParams('sort=-config');

    await renderLoadedPage();

    expect(renderedLabels()[0]).toContain('Ad optimizer');
  });

  it('lists the pins in order, including workflows from other organizations', async () => {
    await renderLoadedPage();

    const rows = within(featuredSection()).getAllByTestId(
      'admin-featured-workflow-row',
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Founder thread'),
      expect.stringContaining('Another org workflow'),
    ]);
    expect(
      within(rows[0] as HTMLElement).getByText('Position 1'),
    ).toBeVisible();
    expect(
      within(workflowRow('Founder thread')).getByText('Featured'),
    ).toBeInTheDocument();
    expect(
      within(workflowRow('Launch thread')).queryByText('Featured'),
    ).not.toBeInTheDocument();
  });

  it('hides Featured when nothing is pinned', async () => {
    mocks.list.mockResolvedValue([]);
    await renderLoadedPage();

    expect(
      screen.queryByRole('region', { name: /^Featured/ }),
    ).not.toBeInTheDocument();
  });

  it('pins a workflow from its actions menu, by keyboard', async () => {
    mocks.pin.mockResolvedValue([
      ...PINS,
      pinSummary('wf-tenant', 'Launch thread', 3),
    ]);
    await renderLoadedPage();

    await clickRowAction('Launch thread', 'Pin to Featured');

    await waitFor(() => {
      expect(
        within(featuredSection()).getAllByTestId('admin-featured-workflow-row'),
      ).toHaveLength(3);
    });
    expect(mocks.pin).toHaveBeenCalledWith('wf-tenant');
    expect(notificationsService.success).toHaveBeenCalledWith(
      'Pinned to Featured',
    );
  });

  it('unpins a pinned workflow from its actions menu', async () => {
    mocks.unpin.mockResolvedValue([PINS[1]]);
    await renderLoadedPage();

    expect(
      within(workflowRow('Founder thread')).queryByRole('button', {
        name: 'Pin to Featured',
      }),
    ).not.toBeInTheDocument();
    await clickRowAction('Founder thread', 'Unpin');

    await waitFor(() => {
      expect(
        within(workflowRow('Founder thread')).queryByText('Featured'),
      ).not.toBeInTheDocument();
    });
    expect(mocks.unpin).toHaveBeenCalledWith('wf-pinned');
  });

  it('offers no pin action on a system workflow', async () => {
    await renderLoadedPage();

    const row = workflowRow('Daily digest');

    expect(
      within(row).queryByRole('button', { name: 'Pin to Featured' }),
    ).not.toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument();
  });

  it('reorders with move buttons, disabled at the ends', async () => {
    const user = userEvent.setup();
    mocks.reorder.mockResolvedValue([
      pinSummary('wf-foreign', 'Another org workflow', 1),
      pinSummary('wf-pinned', 'Founder thread', 2),
    ]);
    await renderLoadedPage();

    expect(
      screen.getByRole('button', { name: 'Move Founder thread up' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move Another org workflow down' }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Move Founder thread down' }),
    );

    expect(mocks.reorder).toHaveBeenCalledWith(['wf-foreign', 'wf-pinned']);
    await waitFor(() => {
      expect(
        within(featuredSection())
          .getAllByTestId('admin-featured-workflow-row')
          .map((row) => row.textContent),
      ).toEqual([
        expect.stringContaining('Another org workflow'),
        expect.stringContaining('Founder thread'),
      ]);
    });
    expect(notificationsService.success).toHaveBeenCalledWith(
      'Featured order saved',
    );
  });

  it('unpins from the Featured row', async () => {
    const user = userEvent.setup();
    mocks.unpin.mockResolvedValue([PINS[0]]);
    await renderLoadedPage();

    await user.click(
      screen.getByRole('button', {
        name: 'Unpin Another org workflow from Featured',
      }),
    );

    expect(mocks.unpin).toHaveBeenCalledWith('wf-foreign');
    await waitFor(() => {
      expect(
        within(featuredSection()).getAllByTestId('admin-featured-workflow-row'),
      ).toHaveLength(1);
    });
  });

  it('shows the skeleton, not an empty table, while the first read is in flight', () => {
    mocks.findAllPages.mockReturnValue(new Promise(() => {}));

    render(<WorkflowsPage />, { wrapper: queryClientWrapper() });

    expect(screen.queryByText('Launch thread')).not.toBeInTheDocument();
    expect(screen.queryByText('No workflows found')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /^Featured/ }),
    ).not.toBeInTheDocument();
  });

  it('paints the cached workflows and pins at once when coming back while they revalidate', async () => {
    const client = createTestQueryClient();
    const firstVisit = render(<WorkflowsPage />, {
      wrapper: queryClientWrapper(client),
    });
    await screen.findByText('Launch thread');
    firstVisit.unmount();

    mocks.findAllPages.mockReturnValue(new Promise(() => {}));
    mocks.list.mockReturnValue(new Promise(() => {}));
    mocks.listSystemCatalog.mockReturnValue(new Promise(() => {}));
    render(<WorkflowsPage />, { wrapper: queryClientWrapper(client) });

    expect(screen.getByText('Launch thread')).toBeInTheDocument();
    expect(
      within(featuredSection()).getAllByTestId('admin-featured-workflow-row'),
    ).toHaveLength(2);
  });

  it('shows the read failure in the table instead of an empty list', async () => {
    mocks.findAllPages.mockRejectedValue(new Error('down'));

    render(<WorkflowsPage />, { wrapper: queryClientWrapper() });

    expect(
      await screen.findByText('Failed to load workflows'),
    ).toBeInTheDocument();
    expect(notificationsService.error).toHaveBeenCalledTimes(1);
  });

  it('reloads the pins when a write is refused', async () => {
    const user = userEvent.setup();
    mocks.reorder.mockRejectedValue(new Error('409'));
    await renderLoadedPage();

    await user.click(
      screen.getByRole('button', { name: 'Move Founder thread down' }),
    );

    await waitFor(() => {
      expect(notificationsService.error).toHaveBeenCalledWith(
        'Failed to update the featured status',
      );
    });
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it('shows a scoped retry when the pins fail to load', async () => {
    const user = userEvent.setup();
    mocks.list.mockRejectedValueOnce(new Error('down'));
    await renderLoadedPage();

    const alert = within(featuredSection()).getByRole('alert');
    expect(alert).toHaveTextContent('Featured workflows could not be loaded.');

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        within(featuredSection()).getAllByTestId('admin-featured-workflow-row'),
      ).toHaveLength(2);
    });
  });

  it('lists system and organization workflows in one table, system first', async () => {
    await renderLoadedPage();

    expect(renderedLabels()).toEqual([
      expect.stringContaining('Ad optimizer'),
      expect.stringContaining('Daily digest'),
      expect.stringContaining('Launch thread'),
      expect.stringContaining('Founder thread'),
    ]);
    expect(
      screen.queryByRole('heading', { name: /in this organization/i }),
    ).not.toBeInTheDocument();
  });

  it('labels every row System or Organization', async () => {
    await renderLoadedPage();

    expect(
      within(workflowRow('Ad optimizer')).getByText('System'),
    ).toBeVisible();
    expect(
      within(workflowRow('Daily digest')).getByText('System'),
    ).toBeVisible();
    expect(
      within(workflowRow('Launch thread')).getByText('Organization'),
    ).toBeVisible();
  });

  it('shows a template that is not installed with its schedule and version', async () => {
    await renderLoadedPage();

    const row = workflowRow('Ad optimizer');

    expect(within(row).getByText('Not installed')).toBeVisible();
    expect(within(row).getByText('v1')).toBeVisible();
    expect(
      within(row).getByText('ad automation · Tunes ad spend'),
    ).toBeVisible();
  });

  it('lists an installed template once, from the workflow that stands for it', async () => {
    await renderLoadedPage();

    expect(screen.queryByText('Daily Trends Digest')).not.toBeInTheDocument();
    expect(
      within(workflowRow('Daily digest')).getByText('active'),
    ).toBeVisible();
    expect(within(workflowRow('Daily digest')).getByText('v1')).toBeVisible();
  });

  it('offers no actions on a template that is not installed', async () => {
    await renderLoadedPage();

    expect(
      within(workflowRow('Ad optimizer')).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('keeps a template listed as installed when its workflow is not visible', async () => {
    mocks.findAllPages.mockResolvedValue([TENANT_WORKFLOW]);
    await renderLoadedPage();

    expect(
      within(workflowRow('Daily Trends Digest')).getByText('Installed'),
    ).toBeVisible();
  });

  it('shows only system workflows for ?type=system', async () => {
    mocks.searchParams = new URLSearchParams('type=system');

    render(<WorkflowsPage />, { wrapper: queryClientWrapper() });
    await screen.findByText('Ad optimizer');

    expect(renderedLabels()).toEqual([
      expect.stringContaining('Ad optimizer'),
      expect.stringContaining('Daily digest'),
    ]);
  });

  it('shows only organization workflows for ?type=organization', async () => {
    mocks.searchParams = new URLSearchParams('type=organization');

    await renderLoadedPage();

    expect(renderedLabels()).toEqual([
      expect.stringContaining('Launch thread'),
      expect.stringContaining('Founder thread'),
    ]);
  });

  it('searches templates by description, and leaves the API-searched workflows alone', async () => {
    mocks.searchParams = new URLSearchParams('q=nothing-matches');

    await renderLoadedPage();

    expect(screen.queryByText('Ad optimizer')).not.toBeInTheDocument();
    expect(workflowRow('Launch thread')).toBeVisible();
  });

  it('keeps a template that matches the search', async () => {
    mocks.searchParams = new URLSearchParams('q=tunes');

    await renderLoadedPage();

    expect(workflowRow('Ad optimizer')).toBeVisible();
  });

  it('keeps the workflows table when the catalog fails to load', async () => {
    mocks.listSystemCatalog.mockRejectedValue(new Error('down'));
    await renderLoadedPage();

    expect(
      screen.getByText('The system workflows could not be loaded.'),
    ).toBeVisible();
    expect(workflowRow('Launch thread')).toBeVisible();
  });
});
