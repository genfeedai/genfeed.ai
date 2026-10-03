import '@testing-library/jest-dom/vitest';
import { translateFromCatalog } from '@app-tests/next-intl.stub';
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
  delete: vi.fn(),
  findAllPages: vi.fn(),
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

vi.mock('@services/automation/workflows.service', () => ({
  WorkflowsService: {
    getInstance: () => ({
      delete: mocks.delete,
      findAllPages: mocks.findAllPages,
    }),
  },
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

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmDeleteModal: () => ({ openConfirmDelete: mocks.openConfirmDelete }),
}));

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

function workflowCard(label: string) {
  const card = screen
    .getAllByTestId('admin-workflow-card')
    .find((candidate) => within(candidate).queryByText(label));
  if (!card) {
    throw new Error(`${label} card not rendered`);
  }
  return card;
}

async function openActions(label: string) {
  const user = userEvent.setup();
  const trigger = within(workflowCard(label)).getByRole('button', {
    name: `Actions for ${label}`,
  });
  trigger.focus();
  await user.keyboard('{Enter}');
  return { menu: await screen.findByRole('menu'), user };
}

async function renderLoadedPage() {
  render(<WorkflowsPage />);
  await screen.findByText('Launch thread');
}

describe('Admin workflows page Featured pins (#5511)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getters.clear();
    mocks.findAllPages.mockResolvedValue([
      TENANT_WORKFLOW,
      PINNED_WORKFLOW,
      SYSTEM_WORKFLOW,
    ]);
    mocks.list.mockResolvedValue(PINS);
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
      within(workflowCard('Founder thread')).getByText('Featured'),
    ).toBeInTheDocument();
    expect(
      within(workflowCard('Launch thread')).queryByText('Featured'),
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

    const { menu, user } = await openActions('Launch thread');
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Pin to Featured' }),
    );

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

    const { menu, user } = await openActions('Founder thread');
    expect(
      within(menu).queryByRole('menuitem', { name: 'Pin to Featured' }),
    ).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Unpin' }));

    await waitFor(() => {
      expect(
        within(workflowCard('Founder thread')).queryByText('Featured'),
      ).not.toBeInTheDocument();
    });
    expect(mocks.unpin).toHaveBeenCalledWith('wf-pinned');
  });

  it('offers no pin action on a system workflow', async () => {
    await renderLoadedPage();

    const { menu } = await openActions('Daily digest');

    expect(
      within(menu).queryByRole('menuitem', { name: 'Pin to Featured' }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Delete' }),
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
});
