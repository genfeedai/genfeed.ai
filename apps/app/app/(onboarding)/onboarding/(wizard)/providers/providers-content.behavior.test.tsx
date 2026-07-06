// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import ProvidersContent from './providers-content';

const {
  assignMock,
  getInstallReadinessMock,
  getUsersServiceMock,
  handleStepCompleteMock,
  patchSettingsMock,
  pushMock,
  resolveAuthTokenMock,
} = vi.hoisted(() => ({
  assignMock: vi.fn(),
  getInstallReadinessMock: vi.fn(),
  getUsersServiceMock: vi.fn(),
  handleStepCompleteMock: vi.fn(),
  patchSettingsMock: vi.fn(),
  pushMock: vi.fn(),
  resolveAuthTokenMock: vi.fn(),
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken: vi.fn(),
  }),
}));

vi.mock('@contexts/onboarding/onboarding-context', () => ({
  useOnboarding: () => ({
    handleStepComplete: handleStepCompleteMock,
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

describe('ProvidersContent behavior', () => {
  beforeEach(() => {
    assignMock.mockReset();
    getInstallReadinessMock.mockReset();
    getUsersServiceMock.mockReset();
    handleStepCompleteMock.mockReset();
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
        claude: true,
        codex: true,
        detected: ['Codex CLI', 'Claude CLI'],
      },
      providers: {
        anyConfigured: true,
        configured: ['openai', 'replicate'],
        fal: false,
        imageGenerationReady: true,
        openai: true,
        replicate: true,
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
      patchSettings: patchSettingsMock,
    });
    patchSettingsMock.mockResolvedValue({});
    handleStepCompleteMock.mockResolvedValue(undefined);

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

  it('persists server mode and advances to the summary step', async () => {
    render(<ProvidersContent />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Continue with server defaults' }),
      ).toBeEnabled();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with server defaults' }),
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

    expect(handleStepCompleteMock).toHaveBeenCalledWith('providers');
    expect(pushMock).not.toHaveBeenCalledWith('/onboarding/summary');
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('persists BYOK mode before routing to organization API keys', async () => {
    render(<ProvidersContent />);

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Add my own API keys' }),
      ).toBeInTheDocument();
    });
    expect(
      await screen.findByText('Runtime: server defaults are ready'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Add my own API keys' }));

    await waitFor(() => {
      expect(patchSettingsMock).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          dashboardPreferences: expect.objectContaining({
            onboarding: expect.objectContaining({
              accessMode: 'byok',
              source: 'oss-onboarding',
            }),
          }),
        }),
      );
    });

    expect(pushMock).toHaveBeenCalledWith('/settings/api-keys');
    expect(handleStepCompleteMock).toHaveBeenCalledWith('providers');
  });

  it('marks the saved access choice as the current selection', async () => {
    getInstallReadinessMock.mockResolvedValue({
      access: {
        byokConfiguredProviders: [],
        byokEnabled: false,
        runtimeMode: 'server',
        selectedMode: 'cloud',
        serverDefaultsReady: true,
      },
      authMode: 'better_auth',
      billingMode: 'oss_local',
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

    render(<ProvidersContent />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Use Genfeed Cloud' }),
      ).toBeEnabled();
    });

    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('hides the local agent tools section when the deployment does not expose local tool detection', async () => {
    getInstallReadinessMock.mockResolvedValue({
      access: {
        byokConfiguredProviders: [],
        byokEnabled: false,
        runtimeMode: 'server',
        selectedMode: null,
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
        configured: ['openai', 'replicate'],
        fal: false,
        imageGenerationReady: true,
        openai: true,
        replicate: true,
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

    render(<ProvidersContent />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Continue with server defaults' }),
      ).toBeEnabled();
    });

    expect(screen.queryByText('Local agent tools')).not.toBeInTheDocument();
  });

  it('persists cloud mode and redirects to cloud signup with brand context', async () => {
    render(<ProvidersContent />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Use Genfeed Cloud' }),
      ).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use Genfeed Cloud' }));

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
    expect(handleStepCompleteMock).toHaveBeenCalledWith('providers');

    const redirectUrl = new URL(assignMock.mock.calls[0][0] as string);

    expect(redirectUrl.pathname).toBe('/sign-up');
    expect(redirectUrl.searchParams.get('accessMode')).toBe('cloud');
    expect(redirectUrl.searchParams.get('brandDomain')).toBe('acme.co');
    expect(redirectUrl.searchParams.get('brandName')).toBe('Acme');
    expect(redirectUrl.searchParams.get('source')).toBe('oss-onboarding');
    expect(pushMock).not.toHaveBeenCalledWith('/onboarding/summary');
  });
});
