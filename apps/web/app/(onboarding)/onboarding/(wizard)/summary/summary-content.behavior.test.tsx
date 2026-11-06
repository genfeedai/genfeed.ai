// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import SummaryContent from './summary-content';

const {
  assignMock,
  getBootstrapMock,
  getInstallReadinessMock,
  patchSettingsMock,
  pushMock,
} = vi.hoisted(() => ({
  assignMock: vi.fn(),
  getBootstrapMock: vi.fn(),
  getInstallReadinessMock: vi.fn(),
  patchSettingsMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken: vi.fn(),
  }),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: {
      id: 'user-123',
      settings: {
        dashboardPreferences: {
          scopes: {},
        },
      },
    },
  }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('api-token'),
}));

vi.mock('@hooks/ui/use-gsap-entrance', () => ({
  useGsapTimeline: () => vi.fn(),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/auth/auth.service', () => ({
  AuthService: {
    getInstance: vi.fn(() => ({
      getBootstrap: getBootstrapMock,
    })),
  },
}));

vi.mock('@services/onboarding/onboarding.service', () => ({
  OnboardingService: {
    getInstance: vi.fn(() => ({
      getInstallReadiness: getInstallReadinessMock,
    })),
  },
}));

vi.mock('@services/organization/users.service', () => ({
  UsersService: {
    getInstance: vi.fn(() => ({
      patchSettings: patchSettingsMock,
    })),
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    disabled,
    label,
    onClick,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    label?: string;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} type="button" onClick={onClick}>
      {label ?? children}
    </button>
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
  }: {
    children: ReactNode;
    href: string;
    onClick?: (event: { preventDefault: () => void }) => void;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: pushMock,
  }),
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
})();

const BILLING_READINESS = {
  access: {
    byokConfiguredProviders: [],
    byokEnabled: false,
    runtimeMode: 'server',
    selectedMode: 'cloud',
    serverDefaultsReady: true,
  },
  authMode: 'better_auth',
  billingMode: 'cloud_billing',
  localTools: {
    anyDetected: false,
    claude: false,
    codex: false,
    detected: [],
  },
  providers: {
    anyConfigured: true,
    configured: ['openai'],
    fal: false,
    imageGenerationReady: true,
    openai: true,
    openrouter: true,
    replicate: false,
    textGenerationReady: true,
  },
  ui: {
    showBilling: true,
    showCloudUpgradeCta: false,
    showCredits: true,
    showLocalTools: false,
    showPricing: true,
  },
  workspace: {
    brandId: 'brand-123',
    hasBrand: true,
    hasOrganization: true,
    organizationId: 'org-123',
  },
};

describe('SummaryContent behavior', () => {
  beforeEach(() => {
    assignMock.mockReset();
    getBootstrapMock.mockReset();
    getInstallReadinessMock.mockReset();
    patchSettingsMock.mockReset();
    pushMock.mockReset();
    localStorageMock.clear();

    getInstallReadinessMock.mockResolvedValue({
      access: {
        byokConfiguredProviders: [],
        byokEnabled: false,
        runtimeMode: 'server',
        selectedMode: null,
        serverDefaultsReady: true,
      },
      authMode: 'better_auth',
      billingMode: 'oss_local',
      localTools: {
        anyDetected: true,
        claude: false,
        codex: true,
        detected: ['Codex CLI'],
      },
      providers: {
        anyConfigured: true,
        configured: ['openai'],
        fal: false,
        imageGenerationReady: true,
        openai: true,
        openrouter: true,
        replicate: false,
        textGenerationReady: true,
      },
      ui: {
        showBilling: false,
        showCloudUpgradeCta: true,
        showCredits: false,
        showLocalTools: true,
        showPricing: false,
      },
      workspace: {
        brandId: 'brand-123',
        hasBrand: true,
        hasOrganization: true,
        organizationId: 'org-123',
      },
    });
    getBootstrapMock.mockResolvedValue({
      access: {
        brandId: 'brand-123',
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId: 'org-123',
        subscriptionStatus: '',
        subscriptionTier: '',
        userId: 'user-123',
      },
    });
    patchSettingsMock.mockResolvedValue({});

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        assign: assignMock,
      },
    });

    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, 'acme.co');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandName, 'Acme');
  });

  it('persists self-hosted mode and advances to success', async () => {
    render(<SummaryContent />, { wrapper: queryClientWrapper() });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Continue with self-hosted' }),
      ).toBeEnabled();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with self-hosted' }),
    );

    await waitFor(() => {
      expect(patchSettingsMock).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          dashboardPreferences: expect.objectContaining({
            onboarding: expect.objectContaining({
              accessMode: 'server',
              source: 'oss-onboarding',
            }),
          }),
        }),
      );
    });

    expect(pushMock).toHaveBeenCalledWith('/onboarding/success');
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('shows the real subscription tier and credit balance when billing is enabled', async () => {
    getInstallReadinessMock.mockResolvedValue(BILLING_READINESS);
    getBootstrapMock.mockResolvedValue({
      access: {
        brandId: 'brand-123',
        creditsBalance: 1234,
        hasEverHadCredits: true,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId: 'org-123',
        // Status is a Prisma enum column (SCREAMING labels); tier is a String
        // column that keeps lowercase product vocabulary. See enum_source_of_truth.
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: SubscriptionTier.SCALE,
        userId: 'user-123',
      },
    });

    render(<SummaryContent />, { wrapper: queryClientWrapper() });

    expect(await screen.findByText('Your plan')).toBeInTheDocument();
    expect(await screen.findByText('Scale')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    // The saved access choice (cloud) is flagged as current.
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('says the plan is unavailable when billing cannot be read', async () => {
    getInstallReadinessMock.mockResolvedValue(BILLING_READINESS);
    getBootstrapMock.mockRejectedValue(new Error('offline'));

    render(<SummaryContent />, { wrapper: queryClientWrapper() });

    expect(await screen.findByText('Your plan')).toBeInTheDocument();
    expect(await screen.findAllByText('Unavailable')).toHaveLength(3);
    expect(
      screen.queryByText('No active subscription'),
    ).not.toBeInTheDocument();
  });

  it('shows the install summary while only the plan is still loading', async () => {
    getInstallReadinessMock.mockResolvedValue(BILLING_READINESS);
    getBootstrapMock.mockReturnValue(new Promise(() => {}));

    render(<SummaryContent />, { wrapper: queryClientWrapper() });

    expect(await screen.findByText('openai')).toBeInTheDocument();
    expect(screen.getByText('None detected')).toBeInTheDocument();
    expect(screen.getAllByText('Checking...')).toHaveLength(3);
  });

  it('persists cloud mode and redirects to cloud signup with onboarding context', async () => {
    render(<SummaryContent />, { wrapper: queryClientWrapper() });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Continue to Genfeed Cloud' }),
      ).toBeEnabled();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue to Genfeed Cloud' }),
    );

    await waitFor(() => {
      expect(patchSettingsMock).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          dashboardPreferences: expect.objectContaining({
            onboarding: expect.objectContaining({
              accessMode: 'cloud',
              source: 'oss-onboarding',
            }),
          }),
        }),
      );
    });

    expect(assignMock).toHaveBeenCalledTimes(1);

    const redirectUrl = new URL(assignMock.mock.calls[0][0] as string);

    expect(redirectUrl.pathname).toBe('/sign-up');
    expect(redirectUrl.searchParams.get('accessMode')).toBe('cloud');
    expect(redirectUrl.searchParams.get('brandDomain')).toBe('acme.co');
    expect(redirectUrl.searchParams.get('brandName')).toBe('Acme');
    expect(redirectUrl.searchParams.get('source')).toBe('oss-onboarding');
    expect(pushMock).not.toHaveBeenCalledWith('/onboarding/success');
  });

  it('paints the cached install summary at once when the step is revisited', async () => {
    const client = createTestQueryClient();
    const first = render(<SummaryContent />, {
      wrapper: queryClientWrapper(client),
    });
    expect(await screen.findByText('Codex CLI')).toBeInTheDocument();
    first.unmount();

    getInstallReadinessMock.mockReturnValue(new Promise(() => {}));
    render(<SummaryContent />, { wrapper: queryClientWrapper(client) });

    expect(screen.getByText('Codex CLI')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.queryByText('Checking...')).not.toBeInTheDocument();
  });

  it('re-checks readiness on a revisit inside the cache window', async () => {
    const client = createTestQueryClient();
    client.setDefaultOptions({
      queries: { ...client.getDefaultOptions().queries, staleTime: 30_000 },
    });
    const first = render(<SummaryContent />, {
      wrapper: queryClientWrapper(client),
    });
    expect(await screen.findByText('Codex CLI')).toBeInTheDocument();
    first.unmount();

    // A provider key was removed in another tab.
    getInstallReadinessMock.mockResolvedValue({
      ...BILLING_READINESS,
      providers: {
        ...BILLING_READINESS.providers,
        anyConfigured: false,
        configured: [],
      },
      ui: { ...BILLING_READINESS.ui, showBilling: false },
    });
    render(<SummaryContent />, { wrapper: queryClientWrapper(client) });

    expect(await screen.findByText('None configured')).toBeInTheDocument();
  });

  it('shows a choice saved here as current when the step is revisited', async () => {
    const client = createTestQueryClient();
    const first = render(<SummaryContent />, {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Continue with self-hosted' }),
      ).toBeEnabled();
    });
    expect(screen.queryByText('Current')).not.toBeInTheDocument();
    getInstallReadinessMock.mockReturnValue(new Promise(() => {}));
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with self-hosted' }),
    );
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/onboarding/success');
    });
    first.unmount();

    render(<SummaryContent />, { wrapper: queryClientWrapper(client) });

    expect(screen.getByText('Current')).toBeInTheDocument();
  });
});
