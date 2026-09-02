import { PageScope } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import ModelsList from '@pages/models/list/models-list';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('next/navigation', () => ({
  usePathname: () => '/models',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

function buildModel(overrides: Partial<IModel> = {}): IModel {
  return {
    category: 'image',
    id: 'model-1',
    isActive: true,
    isDeleted: false,
    key: 'flux-dev',
    label: 'Flux Dev',
    provider: 'replicate',
    ...overrides,
  } as unknown as IModel;
}

function renderModelsList(scope: PageScope = PageScope.ORGANIZATION) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return render(<ModelsList scope={scope} />, { wrapper: Wrapper });
}

describe('ModelsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAll.mockResolvedValue([buildModel()]);
    mockFindAllPages.mockResolvedValue([]);
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

  it('does not render the admin header outside the superadmin scope', async () => {
    renderModelsList();

    await waitFor(() => {
      expect(screen.getByText('Flux Dev')).toBeInTheDocument();
    });
    expect(screen.queryByText(/default models/i)).not.toBeInTheDocument();
  });
});
