// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandContent from './brand-content';

const {
  currentUserState,
  findMeBrandsMock,
  findMeOrganizationsMock,
  getTokenMock,
  handleStepCompleteMock,
  patchMeMock,
  patchSettingsMock,
  pushMock,
  queueStarterAssetsMock,
  renameWithOrganizationSyncMock,
  resolveAuthTokenMock,
  scrapeMock,
  searchParamsMock,
  setOnboardingAccountTypeMock,
  toastErrorMock,
  toastWarningMock,
  updateAccountTypeMock,
} = vi.hoisted(() => ({
  currentUserState: {
    currentUser: { email: '' } as { email: string; name?: string },
    isLoading: false,
  },
  findMeBrandsMock: vi.fn(),
  findMeOrganizationsMock: vi.fn(),
  getTokenMock: vi.fn(),
  handleStepCompleteMock: vi.fn(),
  patchMeMock: vi.fn(),
  patchSettingsMock: vi.fn(),
  pushMock: vi.fn(),
  queueStarterAssetsMock: vi.fn(),
  renameWithOrganizationSyncMock: vi.fn(),
  resolveAuthTokenMock: vi.fn(),
  scrapeMock: vi.fn(),
  searchParamsMock: new URLSearchParams(),
  setOnboardingAccountTypeMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
  updateAccountTypeMock: vi.fn(),
}));

vi.mock('@contexts/onboarding/onboarding-context', () => ({
  useOnboarding: () => ({
    handleStepComplete: handleStepCompleteMock,
    setAccountType: setOnboardingAccountTypeMock,
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: getTokenMock,
  }),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => currentUserState,
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => resolveAuthTokenMock(...args),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');

  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    warning: (...args: unknown[]) => toastWarningMock(...args),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: vi.fn(() => ({
      renameWithOrganizationSync: renameWithOrganizationSyncMock,
      scrape: scrapeMock,
    })),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(() => ({
      patchSettings: patchSettingsMock,
      updateAccountType: updateAccountTypeMock,
    })),
  },
}));

vi.mock('@services/organization/users.service', () => ({
  UsersService: {
    getInstance: vi.fn(() => ({
      findMeBrands: findMeBrandsMock,
      findMeOrganizations: findMeOrganizationsMock,
      patchMe: patchMeMock,
    })),
  },
}));

vi.mock('@services/onboarding/onboarding.service', () => ({
  OnboardingService: {
    getInstance: vi.fn(() => ({
      queueStarterAssets: queueStarterAssetsMock,
    })),
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    isLoading,
    label,
    onClick,
    type = 'button',
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    isLoading?: boolean;
    label?: string;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
  }) => (
    <button disabled={isDisabled || isLoading} type={type} onClick={onClick}>
      {label ?? children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    id,
    onChange,
    placeholder,
    value,
  }: {
    id?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <input
      id={id}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  ),
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => searchParamsMock,
}));

// Real-time waits: the component holds the loading step visible for
// MIN_LOADING_DISPLAY_MS (1.6s) regardless of how fast setup work resolves.
// Fake timers do not mix safely with RTL's own polling-based `waitFor` /
// `findBy*`, so these tests wait on the real clock instead.
const LOADING_STEP_WAIT_OPTIONS = { timeout: 5000 };

// The default per-test timeout (5s) leaves no room for a 1.6s real-time wait
// plus setup; give this suite headroom instead of racing the clock.
vi.setConfig({ testTimeout: 10000 });

describe('app/(onboarding)/onboarding/(wizard)/brand/brand-content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    searchParamsMock.forEach((_value, key) => {
      searchParamsMock.delete(key);
    });
    currentUserState.currentUser = { email: '' };
    currentUserState.isLoading = false;

    getTokenMock.mockResolvedValue('token');
    resolveAuthTokenMock.mockImplementation(async (getToken: () => unknown) =>
      typeof getToken === 'function' ? await getToken() : 'token',
    );
    findMeBrandsMock.mockResolvedValue([{ id: 'brand-1' }]);
    findMeOrganizationsMock.mockResolvedValue([{ id: 'org-1' }]);
    updateAccountTypeMock.mockResolvedValue(undefined);
    renameWithOrganizationSyncMock.mockResolvedValue(undefined);
    scrapeMock.mockResolvedValue(undefined);
    queueStarterAssetsMock.mockResolvedValue({ queued: true });
    patchSettingsMock.mockResolvedValue(undefined);
    patchMeMock.mockResolvedValue(undefined);
  });

  it('skips straight to the loading step for a work email and enriches from the domain', async () => {
    currentUserState.currentUser = { email: 'vincent@acme.com' };

    render(<BrandContent />);

    // No account type / name / audience / tone form ever renders.
    expect(screen.queryByPlaceholderText(/website/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(updateAccountTypeMock).toHaveBeenCalledWith('org-1', 'CREATOR');
    }, LOADING_STEP_WAIT_OPTIONS);
    expect(renameWithOrganizationSyncMock).toHaveBeenCalledWith(
      'brand-1',
      'Acme',
      { organizationLabel: 'Acme' },
    );
    expect(scrapeMock).toHaveBeenCalledWith(
      'brand-1',
      expect.objectContaining({ brandUrl: 'https://acme.com' }),
    );
    expect(queueStarterAssetsMock).toHaveBeenCalledWith(
      'brand-1',
      'https://acme.com',
    );

    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    }, LOADING_STEP_WAIT_OPTIONS);
  });

  it('asks a personal inbox for a website before loading', async () => {
    currentUserState.currentUser = { email: 'vincent@gmail.com' };

    render(<BrandContent />);

    const websiteInput = await screen.findByPlaceholderText(
      'https://yoursite.com',
    );
    fireEvent.change(websiteInput, {
      target: { value: 'https://shipshit.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(scrapeMock).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({ brandUrl: 'https://shipshit.dev' }),
      );
    }, LOADING_STEP_WAIT_OPTIONS);
    expect(queueStarterAssetsMock).toHaveBeenCalledWith(
      'brand-1',
      'https://shipshit.dev',
    );
    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    }, LOADING_STEP_WAIT_OPTIONS);
  });

  it('skipping the website prompt completes the onboarding gate without a website', async () => {
    currentUserState.currentUser = { email: 'vincent@gmail.com' };

    render(<BrandContent />);

    await screen.findByPlaceholderText('https://yoursite.com');
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => {
      expect(patchSettingsMock).toHaveBeenCalledWith('org-1', {
        isFirstLogin: false,
      });
    });
    expect(patchMeMock).toHaveBeenCalledWith({ isOnboardingCompleted: true });
    expect(pushMock).toHaveBeenCalledWith('/');
    expect(scrapeMock).not.toHaveBeenCalled();
  });

  it('surfaces a starter-assets queue failure without blocking onboarding', async () => {
    currentUserState.currentUser = { email: 'vincent@acme.com' };
    queueStarterAssetsMock.mockRejectedValue(new Error('queue unavailable'));

    render(<BrandContent />);

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    }, LOADING_STEP_WAIT_OPTIONS);
    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    }, LOADING_STEP_WAIT_OPTIONS);
  });

  it('surfaces a classified scrape warning as a toast without blocking onboarding (#5080)', async () => {
    currentUserState.currentUser = { email: 'vincent@acme.com' };
    scrapeMock.mockResolvedValue({
      brandId: 'brand-1',
      scrapeWarning: {
        code: 'BRAND_SCRAPE_SITE_UNREACHABLE',
        message: 'We could not reach that website.',
      },
      success: true,
    });

    render(<BrandContent />);

    await waitFor(() => {
      expect(toastWarningMock).toHaveBeenCalledWith(
        "We couldn't reach your site, but your brand setup continued — you can add details anytime.",
      );
    }, LOADING_STEP_WAIT_OPTIONS);
    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    }, LOADING_STEP_WAIT_OPTIONS);
  });

  it('surfaces a classified scrape rejection as a toast without blocking onboarding (#5080)', async () => {
    currentUserState.currentUser = { email: 'vincent@acme.com' };
    scrapeMock.mockRejectedValue({
      errors: [
        {
          code: 'BRAND_SCRAPE_SITE_BLOCKED',
          detail: 'Failed to setup brand',
          title: 'Brand Setup Failed',
        },
      ],
    });

    render(<BrandContent />);

    await waitFor(() => {
      expect(toastWarningMock).toHaveBeenCalledWith(
        'Your site blocked our request to read it, but your brand setup continued — you can add details anytime.',
      );
    }, LOADING_STEP_WAIT_OPTIONS);
    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    }, LOADING_STEP_WAIT_OPTIONS);
  });
});
