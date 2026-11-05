import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paginatedResponse } from '@app-tests/paginated-response';
import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import { PageScope, SubscriptionTier } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { ITraining } from '@genfeedai/contracts/interfaces';
import type { AutoPaginationProps } from '@props/ui/navigation/pagination.props';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import TrainingsList from '@/features/trainings/list/trainings-list';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAllPage = vi.fn();
const mockPatch = vi.fn();
const mockGetTrainingImages = vi.fn();
const searchParamsState = vi.hoisted(() => ({
  current: new URLSearchParams(''),
}));
const mockSubscribe = vi.fn(() => () => undefined);
const mockOpenConfirm = vi.fn();

const brandState = {
  brands: [{ id: 'brand-1', label: 'Acme' }],
  brandId: 'brand-1',
  isReady: true,
  organizationId: 'org-1',
  settings: { subscriptionTier: SubscriptionTier.SCALE },
};

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isSelfHostedDeployment: () => false,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    isSignedIn: true,
    orgId: 'org-1',
    userId: 'user-1',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: <TService,>(factory: (token: string) => TService) =>
    vi.fn(async () => factory('test-token')),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ subscribe: mockSubscribe }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandHref: (route: string) => route,
    orgHref: (route: string) => route,
  }),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: () => ({ openConfirm: mockOpenConfirm }),
  }),
);

vi.mock('@services/ai/trainings.service', () => ({
  TrainingsService: {
    getInstance: () => ({
      delete: vi.fn(),
      findAllPage: mockFindAllPage,
      getTrainingImages: mockGetTrainingImages,
      patch: mockPatch,
    }),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/trainings',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParamsState.current,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({ totals }: AutoPaginationProps) => (
    <nav aria-label="pagination">
      {totals?.totalDocs} trainings / {totals?.totalPages} pages
    </nav>
  ),
}));

function buildTraining(overrides: Partial<ITraining> = {}): ITraining {
  return {
    id: 'training-1',
    isActive: true,
    isDeleted: false,
    label: 'Brand Style v1',
    status: 'completed',
    steps: 1200,
    trigger: 'brandstyle',
    ...overrides,
  } as unknown as ITraining;
}

function renderTrainingsList(scope: PageScope = PageScope.ORGANIZATION) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ContextSidebarProvider>
        <TrainingsList scope={scope} />
        <ContextSidebarOutlet testId="rail" />
      </ContextSidebarProvider>
    </QueryClientProvider>,
  );
}

describe('TrainingsList', () => {
  it('uses the canonical admin images route for training details', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'trainings-list.tsx'),
      'utf8',
    );

    expect(source).toContain('APP_ROUTES.ADMIN.AUTOMATION.TRAININGS');
    expect(source).toMatch(/TRAININGS}\/\${training\.id}`/);
    expect(source).not.toMatch(/router\.push\(`\/trainings\//);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.current = new URLSearchParams('');
    brandState.settings = { subscriptionTier: SubscriptionTier.SCALE };
    mockFindAllPage.mockResolvedValue(paginatedResponse([buildTraining()]));
  });

  it('renders the fetched trainings in the table', async () => {
    renderTrainingsList();

    await waitFor(() => {
      expect(screen.getByText('Brand Style v1')).toBeInTheDocument();
    });
    expect(screen.getByText('brandstyle')).toBeInTheDocument();
  });

  it('requests the URL page with the page size and renders pagination', async () => {
    searchParamsState.current = new URLSearchParams('page=2');

    renderTrainingsList(PageScope.SUPERADMIN);

    await waitFor(() => {
      expect(mockFindAllPage).toHaveBeenCalledWith(
        { limit: ITEMS_PER_PAGE, page: 2 },
        expect.anything(),
      );
    });
    expect(
      await screen.findByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });

  it.each([
    ['label', 'label: 1'],
    ['-status', 'status: -1'],
  ])(
    'asks the server to order trainings by the %s URL sort',
    async (urlSort, apiSort) => {
      searchParamsState.current = new URLSearchParams({ sort: urlSort });

      renderTrainingsList();

      await waitFor(() => {
        expect(mockFindAllPage).toHaveBeenCalledWith(
          { limit: ITEMS_PER_PAGE, page: 1, sort: apiSort },
          expect.anything(),
        );
      });
    },
  );

  it.each(['steps', '-isActive', ''])(
    'does not send the unsortable URL sort %j',
    async (urlSort) => {
      searchParamsState.current = new URLSearchParams({ sort: urlSort });

      renderTrainingsList();

      await waitFor(() => {
        expect(mockFindAllPage).toHaveBeenCalledWith(
          { limit: ITEMS_PER_PAGE, page: 1 },
          expect.anything(),
        );
      });
    },
  );

  it('links the admin name to the training page', async () => {
    renderTrainingsList(PageScope.SUPERADMIN);

    const nameLink = await screen.findByRole('link', {
      name: 'Open Brand Style v1',
    });
    expect(nameLink).toHaveAttribute(
      'href',
      '/admin/automation/trainings/training-1',
    );
  });

  it('opens an editable summary in the sidebar on row click', async () => {
    renderTrainingsList();

    fireEvent.click(await screen.findByText('Brand Style v1'));

    expect(await screen.findByText('Trigger word')).toBeInTheDocument();
    const rail = within(screen.getByTestId('rail'));
    expect(rail.getByRole('button', { name: 'Label' })).toHaveTextContent(
      'Brand Style v1',
    );
    expect(rail.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('shows what a training learned from and made, and its latest images, in the sidebar', async () => {
    mockFindAllPage.mockResolvedValue(
      paginatedResponse([
        buildTraining({
          model: 'genfeed/brand-style',
          totalGeneratedImages: 42,
          totalSources: 12,
        }),
      ]),
    );
    mockGetTrainingImages.mockResolvedValue(
      paginatedResponse([
        {
          createdAt: '2026-11-01T10:00:00.000Z',
          generationPrompt: 'brandstyle sneaker on a beach',
          id: 'image-1',
        },
      ]),
    );
    renderTrainingsList();

    fireEvent.click(await screen.findByText('Brand Style v1'));

    const rail = within(screen.getByTestId('rail'));
    expect(
      await rail.findByText('brandstyle sneaker on a beach'),
    ).toBeInTheDocument();
    expect(rail.getByText('Recent generations')).toBeInTheDocument();
    expect(rail.getByText('42')).toBeInTheDocument();
    expect(rail.getByText('12')).toBeInTheDocument();
  });

  it('says so in the sidebar when nothing has been made with a training yet', async () => {
    mockFindAllPage.mockResolvedValue(
      paginatedResponse([buildTraining({ model: 'genfeed/brand-style' })]),
    );
    mockGetTrainingImages.mockResolvedValue(paginatedResponse([]));
    renderTrainingsList();

    fireEvent.click(await screen.findByText('Brand Style v1'));

    expect(
      await within(screen.getByTestId('rail')).findByText(
        'Nothing made with this model yet',
      ),
    ).toBeInTheDocument();
  });

  it('saves a label edited in the sidebar and reloads the list', async () => {
    mockPatch.mockResolvedValue({});
    renderTrainingsList();

    fireEvent.click(await screen.findByText('Brand Style v1'));
    const rail = within(screen.getByTestId('rail'));
    fireEvent.click(await rail.findByRole('button', { name: 'Label' }));
    const input = rail.getByRole('textbox', { name: 'Label' });
    fireEvent.change(input, { target: { value: 'Brand Style v2' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('training-1', {
        label: 'Brand Style v2',
      });
    });
    await waitFor(() => {
      expect(mockFindAllPage).toHaveBeenCalledTimes(2);
    });
  });

  it('does not link the name in the organization scope', async () => {
    renderTrainingsList();

    await waitFor(() => {
      expect(screen.getByText('Brand Style v1')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('link', { name: 'Open Brand Style v1' }),
    ).not.toBeInTheDocument();
  });

  it('renders the empty state when no trainings come back', async () => {
    mockFindAllPage.mockResolvedValue(paginatedResponse([]));

    renderTrainingsList();

    await waitFor(() => {
      expect(screen.getByText('No trainings yet')).toBeInTheDocument();
    });
  });

  it('locks the surface behind an upgrade CTA on unentitled tiers', async () => {
    brandState.settings = { subscriptionTier: SubscriptionTier.FREE };

    renderTrainingsList();

    await waitFor(() => {
      expect(
        screen.getByText(/Unlock trainings with Scale/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Brand Style v1')).not.toBeInTheDocument();
  });

  it('renders the admin org/brand filter in the superadmin scope', async () => {
    renderTrainingsList(PageScope.SUPERADMIN);

    await waitFor(() => {
      expect(screen.getByText('Brand Style v1')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Unlock trainings/i)).not.toBeInTheDocument();
  });
  it('keeps server totals with the training rows', async () => {
    mockFindAllPage.mockResolvedValue(
      paginatedResponse([buildTraining()], { totalDocs: 61, totalPages: 5 }),
    );
    renderTrainingsList();
    await screen.findByText('Brand Style v1');
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('61 trainings / 5 pages');
  });
});
