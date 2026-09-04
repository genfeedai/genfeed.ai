import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PageScope, SubscriptionTier } from '@genfeedai/contracts';
import type { ITraining } from '@genfeedai/contracts/interfaces';
import TrainingsList from '@pages/trainings/list/trainings-list';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAllPages = vi.fn();
const mockSubscribe = vi.fn(() => () => undefined);
const mockOpenConfirm = vi.fn();

const brandState = {
  brandId: 'brand-1',
  isReady: true,
  organizationId: 'org-1',
  settings: { subscriptionTier: SubscriptionTier.PRO },
};

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isSelfHostedDeployment: () => false,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isSignedIn: true }),
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

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({ openConfirm: mockOpenConfirm }),
}));

vi.mock('@services/ai/trainings.service', () => ({
  TrainingsService: {
    getInstance: () => ({
      delete: vi.fn(),
      findAllPages: mockFindAllPages,
      patch: vi.fn(),
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
  useSearchParams: () => new URLSearchParams(''),
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

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return render(<TrainingsList scope={scope} />, { wrapper: Wrapper });
}

describe('TrainingsList', () => {
  it('uses the canonical admin images route for training details', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'trainings-list.tsx'),
      'utf8',
    );

    expect(source).toContain('APP_ROUTES.ADMIN.AUTOMATION.TRAININGS');
    expect(source).toMatch(/training\.id}\/images/);
    expect(source).not.toMatch(/router\.push\(`\/trainings\//);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    brandState.settings = { subscriptionTier: SubscriptionTier.PRO };
    mockFindAllPages.mockResolvedValue([buildTraining()]);
  });

  it('renders the fetched trainings in the table', async () => {
    renderTrainingsList();

    await waitFor(() => {
      expect(screen.getByText('Brand Style v1')).toBeInTheDocument();
    });
    expect(screen.getByText('brandstyle')).toBeInTheDocument();
  });

  it('renders the empty state when no trainings come back', async () => {
    mockFindAllPages.mockResolvedValue([]);

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
        screen.getByText(/Unlock trainings with Pro/i),
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
});
