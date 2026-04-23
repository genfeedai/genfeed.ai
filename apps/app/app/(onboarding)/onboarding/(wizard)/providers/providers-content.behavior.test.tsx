// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import ProvidersContent from './providers-content';

const {
  assignMock,
  getInstallReadinessMock,
  getUsersServiceMock,
  patchSettingsMock,
  pushMock,
  resolveClerkTokenMock,
} = vi.hoisted(() => ({
  assignMock: vi.fn(),
  getInstallReadinessMock: vi.fn(),
  getUsersServiceMock: vi.fn(),
  patchSettingsMock: vi.fn(),
  pushMock: vi.fn(),
  resolveClerkTokenMock: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
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

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: (...args: unknown[]) => resolveClerkTokenMock(...args),
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
    patchSettingsMock.mockReset();
    pushMock.mockReset();
    resolveClerkTokenMock.mockReset();
    localStorageMock.clear();

    resolveClerkTokenMock.mockResolvedValue('api-token');
    getInstallReadinessMock.mockResolvedValue({
      access: {
        byokConfiguredProviders: [],
        byokEnabled: false,
        runtimeMode: 'server',
        selectedMode: null,
        serverDefaultsReady: true,
      },
      authMode: 'clerk',
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

    expect(pushMock).toHaveBeenCalledWith('/onboarding/summary');
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('persists BYOK mode before routing to organization API keys', async () => {
    render(<ProvidersContent />);

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Add my own API keys' }),
      ).toBeInTheDocument();
    });

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

    expect(pushMock).toHaveBeenCalledWith('/settings/organization/api-keys');
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

    const redirectUrl = new URL(assignMock.mock.calls[0][0] as string);

    expect(redirectUrl.pathname).toBe('/sign-up');
    expect(redirectUrl.searchParams.get('accessMode')).toBe('cloud');
    expect(redirectUrl.searchParams.get('brandDomain')).toBe('acme.co');
    expect(redirectUrl.searchParams.get('brandName')).toBe('Acme');
    expect(redirectUrl.searchParams.get('source')).toBe('oss-onboarding');
    expect(pushMock).not.toHaveBeenCalledWith('/onboarding/summary');
  });
});
