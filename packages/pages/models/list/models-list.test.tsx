import { PageScope } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import ModelsList from '@pages/models/list/models-list';
import type { ModelsListProps } from '@props/admin/models.props';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const mockFindAll = vi.fn();
const mockFindAllPages = vi.fn();
const mockOrganizationFindOne = vi.fn();
const mockOpenConfirm = vi.fn();
const mockOpenModal = vi.fn();

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: (...args: unknown[]) => mockOpenModal(...args),
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyModalModel: () => null,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({ openConfirm: mockOpenConfirm }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: <TService,>(factory: (token: string) => TService) =>
    vi.fn(async () => factory('test-token')),
}));

vi.mock('@services/ai/models.service', () => ({
  ModelsService: {
    getInstance: () => ({
      findAll: mockFindAll,
      findAllPages: mockFindAllPages,
    }),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({
      findOne: mockOrganizationFindOne,
      getAllOrganizations: async () => [
        { id: 'org-1', label: 'Alpha Organization' },
        { id: 'org-2', label: 'Beta Organization' },
      ],
      findOrganizationBrands: async () => [
        { id: 'brand-1', label: 'First Brand' },
      ],
    }),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

const mockReplace = vi.fn();
let mockSearchParams = '';

vi.mock('next/navigation', () => ({
  usePathname: () => '/models',
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

function buildModel(overrides: Partial<IModel> = {}): IModel {
  return {
    category: 'image',
    cost: 1,
    id: 'model-1',
    isActive: true,
    isDeleted: false,
    key: 'flux-dev',
    label: 'Flux Dev',
    provider: 'replicate',
    ...overrides,
  } as unknown as IModel;
}

function renderModelsList(
  scope: PageScope = PageScope.ORGANIZATION,
  type?: string,
  props: Partial<ModelsListProps> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return render(<ModelsList scope={scope} type={type} {...props} />, {
    wrapper: Wrapper,
  });
}

describe('ModelsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = '';
    mockFindAll.mockResolvedValue([buildModel()]);
    mockFindAllPages.mockResolvedValue([buildModel({ isDefault: true })]);
    mockOrganizationFindOne.mockResolvedValue({ settings: null });
  });

  it('renders the fetched models in the table', async () => {
    renderModelsList();

    await waitFor(() => {
      expect(screen.getByText('Flux Dev')).toBeInTheDocument();
    });
  });

  it('requests only active models outside the admin scope', async () => {
    renderModelsList();

    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });
    expect(mockFindAll.mock.calls[0]?.[0]).toMatchObject({ isActive: true });
    expect(mockFindAll.mock.calls[0]?.[0]).not.toHaveProperty('includeRetired');
  });

  it('sends every selected category and provider to the API before pagination', async () => {
    mockSearchParams =
      'category=image&category=video&provider=replicate&provider=fal&status=inactive&page=2';
    renderModelsList(PageScope.SUPERADMIN);
    await waitFor(() => expect(mockFindAll).toHaveBeenCalled());
    expect(mockFindAll.mock.calls[0]?.[0]).toMatchObject({
      categories: 'image,video',
      providers: 'replicate,fal',
      isActive: false,
      page: 2,
    });
    expect(
      await screen.findByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Image 1')).not.toBeInTheDocument();
  });

  it('hides retired models on the default admin listing', async () => {
    renderModelsList(PageScope.SUPERADMIN);

    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });
    expect(mockFindAll.mock.calls[0]?.[0]).toMatchObject({
      includeRetired: false,
    });
  });

  it('expands inline pricing from a row click and edits from the single pencil action', async () => {
    const onPricingDetails = vi.fn();
    renderModelsList(PageScope.SUPERADMIN, undefined, {
      onPricingDetails,
      renderExpandedRow: () => <div>Provider pricing evidence</div>,
    });

    const row = (await screen.findAllByText('Flux Dev'))
      .map((label) => label.closest('tr'))
      .find((candidate) => candidate !== null);
    if (!row) throw new Error('Missing model row');
    fireEvent.click(row);

    expect(onPricingDetails).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'model-1' }),
    );
    expect(screen.getByText('Provider pricing evidence')).toBeInTheDocument();
    expect(mockOpenModal).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Pricing details' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View Details' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Edit model' }).length,
    ).toBeGreaterThan(0);
  });

  it('puts an extra row action in the actions section beside edit', async () => {
    const onClick = vi.fn();
    renderModelsList(PageScope.SUPERADMIN, undefined, {
      onPricingDetails: vi.fn(),
      rowActions: [
        {
          icon: <span>wrench</span>,
          isVisible: (model) => model.id === 'model-1',
          onClick,
          tooltip: 'Fix pricing',
        },
      ],
    });

    const [fix] = await screen.findAllByRole('button', { name: 'Fix pricing' });
    if (!fix) throw new Error('Missing fix action');
    expect(fix.closest('td')).toBe(
      screen.getAllByRole('button', { name: 'Edit model' })[0]?.closest('td'),
    );
    fireEvent.click(fix);

    expect(onClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'model-1' }),
    );
  });

  it('leads the first page with models that need attention, including ones sorted onto later pages', async () => {
    const needsAttention = buildModel({
      id: 'zebra',
      key: 'zebra/model',
      label: 'Zebra Model',
    });
    mockFindAll.mockResolvedValue([
      buildModel({ id: 'alpha', key: 'alpha/model', label: 'Alpha Model' }),
      buildModel({ id: 'beta', key: 'beta/model', label: 'Beta Model' }),
    ]);
    mockFindAllPages.mockResolvedValue([
      buildModel({ id: 'alpha', key: 'alpha/model', label: 'Alpha Model' }),
      needsAttention,
    ]);
    renderModelsList(PageScope.SUPERADMIN, undefined, {
      isModelPinned: (model) => model.id === 'zebra',
    });

    await screen.findByText('Alpha Model');
    const labels = screen
      .getAllByRole('row')
      .map((row) => row.textContent ?? '')
      .filter((text) => /(Alpha|Beta|Zebra) Model/.test(text))
      .map((text) => /(Alpha|Beta|Zebra)/.exec(text)?.[1]);

    expect(labels).toEqual(['Zebra', 'Alpha', 'Beta']);
  });

  it('includes retired models on the admin All listing', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    render(<ModelsList category="all" scope={PageScope.SUPERADMIN} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });
    expect(mockFindAll.mock.calls[0]?.[0]).toMatchObject({
      includeRetired: true,
    });
  });

  it('requests the selected column sort for the full paginated result', async () => {
    renderModelsList();

    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'label: 1' }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Label' }));

    await waitFor(() => {
      expect(mockFindAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'label: -1' }),
      );
    });
    expect(
      screen.getByRole('columnheader', { name: /label/i }),
    ).toHaveAttribute('aria-sort', 'descending');
  });

  it('renders the empty state when no models come back', async () => {
    mockFindAll.mockResolvedValue([]);

    renderModelsList();

    await waitFor(() => {
      expect(screen.getByText('No models found')).toBeInTheDocument();
    });
  });

  it('renders the shared category overview outside the superadmin scope', async () => {
    renderModelsList();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Image/ })).toHaveTextContent(
        'Image1',
      );
    });
    expect(screen.getByText('Model catalog')).toBeInTheDocument();
    // Every category sits in a single tab row.
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'All1',
      'Image1',
      'Video0',
      'Music0',
      'Voice0',
      'Text0',
      'Embedding0',
    ]);
  });

  it('lists a whole catalog group when a category is selected', async () => {
    renderModelsList(PageScope.ORGANIZATION, 'image');

    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });
    expect(mockFindAll.mock.calls[0]?.[0]).toMatchObject({
      categories: 'image,image-edit,image-upscale',
    });
    expect(mockFindAll.mock.calls[0]?.[0]).not.toHaveProperty('category');
    expect(screen.getByRole('tab', { name: /^Image/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('filters by category from the one-line chip row', async () => {
    renderModelsList();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Video/ })).toBeInTheDocument();
    });
    // Radix tabs activate on mouse down.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Video/ }), {
      button: 0,
    });

    expect(mockReplace).toHaveBeenCalledWith('/models?type=video', {
      scroll: false,
    });
  });

  it('keeps search and filters in one shared admin topbar without the body toolbar', async () => {
    renderModelsList(PageScope.SUPERADMIN);
    await screen.findByText('Flux Dev');
    const toolbar = screen.getByTestId('section-topbar');
    expect(screen.getAllByTestId('section-topbar')).toHaveLength(1);
    expect(screen.getByTestId('section-topbar-leading')).toContainElement(
      screen.getByRole('textbox', { name: 'Search models' }),
    );
    expect(
      within(toolbar).getByRole('button', { name: /^Filters/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(1);
    expect(screen.queryByText('Model catalog')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('preserves other filters and scope while changing categories from the popover', async () => {
    mockSearchParams =
      'organization=org-1&brand=brand-1&provider=fal&status=active&page=3';
    renderModelsList(PageScope.SUPERADMIN);
    fireEvent.click(await screen.findByRole('button', { name: /^Filters/ }));
    const categories = screen.getByRole('group', { name: 'Categories' });
    fireEvent.click(within(categories).getByRole('button', { name: 'Image' }));
    const query = new URL(
      mockReplace.mock.calls.at(-1)?.[0],
      'https://app.genfeed.ai',
    ).searchParams;
    expect(query.getAll('category')).toEqual(['image']);
    expect(query.getAll('provider')).toEqual(['fal']);
    expect(query.get('status')).toBe('active');
    expect(query.get('organization')).toBe('org-1');
    expect(query.get('brand')).toBe('brand-1');
    expect(query.has('page')).toBe(false);
  });

  it('clears category, provider and status filters without clearing organization scope', async () => {
    mockSearchParams =
      'organization=org-1&brand=brand-1&category=video&provider=fal&status=active&page=3';
    renderModelsList(PageScope.SUPERADMIN);
    fireEvent.click(await screen.findByRole('button', { name: /^Filters/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    const query = new URL(
      mockReplace.mock.calls.at(-1)?.[0],
      'https://app.genfeed.ai',
    ).searchParams;
    expect(query.has('category')).toBe(false);
    expect(query.has('provider')).toBe(false);
    expect(query.get('status')).toBe('all');
    expect(query.get('organization')).toBe('org-1');
    expect(query.get('brand')).toBe('brand-1');
    expect(query.has('page')).toBe(false);
  });

  it('refreshes the model query and the pricing snapshot from the same action', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderModelsList(PageScope.SUPERADMIN, undefined, { onRefresh });
    await screen.findByText('Flux Dev');
    const calls = mockFindAll.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(mockFindAll.mock.calls.length).toBeGreaterThan(calls),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('searches the complete model catalog through the API', async () => {
    renderModelsList();

    fireEvent.change(screen.getByPlaceholderText('Search models'), {
      target: { value: 'claude' },
    });

    await waitFor(() => {
      expect(mockFindAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'claude' }),
      );
    });
  });
});
