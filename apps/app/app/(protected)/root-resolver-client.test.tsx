// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
    refreshBrands: vi.fn(async () => undefined),
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
  searchParams: new URLSearchParams(),
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => mocks.searchParams,
}));

const { default: ProtectedRootResolver } = await import(
  './root-resolver-client'
);

describe('ProtectedRootResolver', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.accessState = null;
    mocks.isAccessStateLoading = false;
    mocks.brandState.brandId = '';
    mocks.brandState.brands = [];
    mocks.brandState.isReady = true;
    mocks.brandState.organizationId = '';
    mocks.brandState.refreshBrands.mockClear();
    mocks.brandState.selectedBrand = null;
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: true,
      onboardingStepsCompleted: ['brand', 'providers', 'summary'],
    };
    mocks.currentUserState.isLoading = false;
    mocks.searchParams = new URLSearchParams();
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
  });

  it('opens workspace overview when a returning user has an active brand', async () => {
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.brandId = 'brand_1';
    mocks.brandState.selectedBrand = {
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'moonrise',
    };

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/acme/moonrise/workspace/overview',
      );
    });
  });

  it('opens workspace overview from the first brand in the active organization', async () => {
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.brands = [
      {
        organization: { slug: 'acme' },
        organizationId: 'org_1',
        slug: 'moonrise',
      },
    ];

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/acme/moonrise/workspace/overview',
      );
    });
  });

  it('preserves task handoff state while removing withdrawn shell query state', async () => {
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.selectedBrand = {
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'moonrise',
    };
    mocks.searchParams = new URLSearchParams({
      overlay: 'asset',
      taskId: 'task-42',
      taskSource: 'workspace',
      thread: 'stale-thread',
    });

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/acme/moonrise/workspace/overview?taskId=task-42&taskSource=workspace',
      );
    });
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
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'default',
    };

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/acme/~/agent/onboarding');
    });
  });

  it('routes incomplete Community users to the shared brand step', async () => {
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: [],
    };
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.selectedBrand = {
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'default',
    };

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand');
    });
  });

  it('keeps self-hosted desktop users on the classic wizard', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'true');
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: ['brand'],
    };
    mocks.brandState.selectedBrand = {
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'default',
    };

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/providers');
    });
  });

  it('fails closed when organization scope has no routable slug', async () => {
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.brands = [];

    render(<ProtectedRootResolver />);

    expect(
      await screen.findByRole('heading', {
        name: 'Workspace setup needs attention',
      }),
    ).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('does not widen root bootstrap into a brand from another organization', async () => {
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.brands = [
      {
        organization: { id: 'org_2', slug: 'other-org' },
        organizationId: 'org_2',
        slug: 'other-brand',
      },
    ];

    render(<ProtectedRootResolver />);

    expect(
      await screen.findByRole('heading', {
        name: 'Workspace setup needs attention',
      }),
    ).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalledWith(
      expect.stringContaining('other-org'),
    );
  });

  it('routes incomplete SaaS users to the agent onboarding surface', async () => {
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: ['brand'],
    };
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.selectedBrand = {
      organization: { slug: 'acme' },
      organizationId: 'org_1',
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
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.selectedBrand = {
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'default',
    };
    rerender(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand');
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
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'default',
    };

    render(<ProtectedRootResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding/providers');
    });
  });

  it('shows an actionable SaaS workspace state instead of waiting forever', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    mocks.brandState.isReady = false;
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: true,
      onboardingStepsCompleted: ['brand', 'providers', 'summary'],
    };

    render(<ProtectedRootResolver />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(
      screen.getByRole('heading', {
        name: 'Workspace setup needs attention',
      }),
    ).toBeInTheDocument();
    // Agent-first users cannot bootstrap through the classic wizard, and no
    // organization scope resolved — retry is the only honest action left.
    expect(
      screen.queryByRole('link', { name: 'Continue setup' }),
    ).not.toBeInTheDocument();

    screen.getByRole('button', { name: 'Retry workspace' }).click();

    expect(mocks.brandState.refreshBrands).toHaveBeenCalledTimes(1);
  });

  it('sends the workspace fallback CTA to the shared brand step once an org scope exists', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    mocks.brandState.isReady = false;
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.selectedBrand = {
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'default',
    };
    mocks.currentUserState.currentUser = {
      id: 'user_1',
      isOnboardingCompleted: true,
      onboardingStepsCompleted: ['brand', 'providers', 'summary'],
    };

    render(<ProtectedRootResolver />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(
      screen.getByRole('link', { name: 'Continue setup' }),
    ).toHaveAttribute('href', '/onboarding/brand');
  });
});
