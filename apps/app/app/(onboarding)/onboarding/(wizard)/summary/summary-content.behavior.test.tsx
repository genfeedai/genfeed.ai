// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import SummaryContent from './summary-content';

const {
  assignMock,
  getBootstrapMock,
  getInstallReadinessMock,
  getUsersServiceMock,
  patchSettingsMock,
  pushMock,
  resolveAuthTokenMock,
} = vi.hoisted(() => ({
  assignMock: vi.fn(),
  getBootstrapMock: vi.fn(),
  getInstallReadinessMock: vi.fn(),
  getUsersServiceMock: vi.fn(),
  patchSettingsMock: vi.fn(),
  pushMock: vi.fn(),
  resolveAuthTokenMock: vi.fn(),
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

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => resolveAuthTokenMock(...args),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getUsersServiceMock,
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

vi.mock('next/navigation', () => ({
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

describe('SummaryContent behavior', () => {
  beforeEach(() => {
    assignMock.mockReset();
    getBootstrapMock.mockReset();
    getInstallReadinessMock.mockReset();
    getUsersServiceMock.mockReset();
    patchSettingsMock.mockReset();
    pushMock.mockReset();
    resolveAuthTokenMock.mockReset();
    localStorageMock.clear();

    resolveAuthTokenMock.mockResolvedValue('api-token');
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
    getUsersServiceMock.mockResolvedValue({
      getBootstrap: getBootstrapMock,
      patchSettings: patchSettingsMock,
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
    render(<SummaryContent />);

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
    getInstallReadinessMock.mockResolvedValue({
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
    });
    getBootstrapMock.mockResolvedValue({
      access: {
        brandId: 'brand-123',
        creditsBalance: 1234,
        hasEverHadCredits: true,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId: 'org-123',
        subscriptionStatus: 'active',
        subscriptionTier: 'pro',
        userId: 'user-123',
      },
    });

    render(<SummaryContent />);

    expect(await screen.findByText('Your plan')).toBeInTheDocument();
    expect(await screen.findByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    // The saved access choice (cloud) is flagged as current.
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('persists cloud mode and redirects to cloud signup with onboarding context', async () => {
    render(<SummaryContent />);

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
});
