import { PageScope } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import ModelsList from '@pages/models/list/models-list';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return render(<ModelsList scope={scope} type={type} />, {
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
      await screen.findByRole('button', { name: 'More options for Flux Dev' }),
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

  it('replaces the duplicate overview with multi-select filters for superadmins', async () => {
    renderModelsList(PageScope.SUPERADMIN);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'All categories' }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
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
