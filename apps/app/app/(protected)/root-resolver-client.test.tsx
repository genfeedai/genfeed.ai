// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accessState: null as { brandId?: string; organizationId?: string } | null,
  brandState: {
    brandId: '',
    brands: [] as Array<{
      organization?: { id?: string; slug?: string };
      organizationId?: string;
      slug?: string;
    }>,
    isReady: true,
    organizationId: '',
    selectedBrand: null as {
      organization?: { id?: string; slug?: string };
      organizationId?: string;
      slug?: string;
    } | null,
  },
  currentUserState: {
    currentUser: {
      id: 'user_1',
      isOnboardingCompleted: true,
      onboardingStepsCompleted: ['brand', 'providers', 'summary'] as string[],
    },
    isLoading: false,
  },
  isAccessStateLoading: false,
  replace: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brandState,
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => mocks.currentUserState,
}));

vi.mock('@providers/access-state/access-state.provider', () => ({
  useAccessState: () => ({
    accessState: mocks.accessState,
    isLoading: mocks.isAccessStateLoading,
  }),
}));

vi.mock('@ui/loading/page/PageLoadingState', () => ({
  default: ({ message }: { message: string }) => (
    <div data-testid="page-loading-state">{message}</div>
  ),
}));

vi.mock('./home/content', () => ({
  default: () => <main data-testid="operational-home" />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
}));

const { default: ProtectedRootResolver } = await import(
  './root-resolver-client'
);

describe('ProtectedRootResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accessState = null;
    mocks.isAccessStateLoading = false;
    mocks.brandState.brandId = '';
    mocks.brandState.brands = [];
    mocks.brandState.isReady = true;
    mocks.brandState.organizationId = '';
    mocks.brandState.selectedBrand = null;
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: true,
      onboardingStepsCompleted: ['brand', 'providers', 'summary'],
    };
    mocks.currentUserState.isLoading = false;
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
  });

  it('renders the operational home when org and brand are selected', async () => {
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.brandId = 'brand_1';
    mocks.brandState.selectedBrand = {
      organization: { id: 'org_1', slug: 'acme' },
      slug: 'moonrise',
    };

    render(<ProtectedRootResolver />);

    expect(await screen.findByTestId('operational-home')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('renders the operational home from the first org brand', async () => {
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.brands = [
      {
        organization: { id: 'org_1', slug: 'acme' },
        slug: 'moonrise',
      },
    ];

    render(<ProtectedRootResolver />);

    expect(await screen.findByTestId('operational-home')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('resumes onboarding before opening a seeded workspace', async () => {
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: ['brand'],
    };
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.brandId = 'brand_1';
    mocks.brandState.selectedBrand = {
      organization: { id: 'org_1', slug: 'acme' },
      slug: 'default',
    };

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/providers');
    });
  });

  it('opens onboarding when no project exists for the organization', async () => {
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.brands = [];

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding');
    });
  });

  it('routes incomplete SaaS users to the agent onboarding surface', async () => {
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: ['brand'],
    };
    mocks.brandState.selectedBrand = {
      organization: { id: 'org_1', slug: 'acme' },
      slug: 'default',
    };

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/acme/~/agent/onboarding');
    });
  });

  it('waits for brand readiness before resolving the agent organization', async () => {
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    mocks.brandState.isReady = false;
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: [],
    };

    const { rerender } = render(<ProtectedRootResolver />);

    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.brandState.isReady = true;
    mocks.brandState.selectedBrand = {
      organization: { id: 'org_1', slug: 'acme' },
      slug: 'default',
    };
    rerender(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/acme/~/agent/onboarding');
    });
  });

  it('keeps cloud-connected desktop users on the classic wizard', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'true');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: ['brand'],
    };
    mocks.brandState.selectedBrand = {
      organization: { id: 'org_1', slug: 'acme' },
      slug: 'default',
    };

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/providers');
    });
  });
});
