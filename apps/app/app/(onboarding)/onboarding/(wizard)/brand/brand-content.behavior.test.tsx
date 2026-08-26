// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import BrandContent from './brand-content';

const {
  findMeBrandsMock,
  findMeOrganizationsMock,
  handleStepCompleteMock,
  patchMeMock,
  patchSettingsMock,
  pushMock,
  renameWithOrganizationSyncMock,
  resolveAuthTokenMock,
  scrapeMock,
  searchParamsMock,
  updateAccountTypeMock,
} = vi.hoisted(() => ({
  findMeBrandsMock: vi.fn(),
  findMeOrganizationsMock: vi.fn(),
  handleStepCompleteMock: vi.fn(),
  patchMeMock: vi.fn(),
  patchSettingsMock: vi.fn(),
  pushMock: vi.fn(),
  renameWithOrganizationSyncMock: vi.fn(),
  resolveAuthTokenMock: vi.fn(),
  scrapeMock: vi.fn(),
  searchParamsMock: new URLSearchParams(),
  updateAccountTypeMock: vi.fn(),
}));

vi.mock('@contexts/onboarding/onboarding-context', () => ({
  useOnboarding: () => ({
    handleStepComplete: handleStepCompleteMock,
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn(),
  }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => resolveAuthTokenMock(...args),
}));

vi.mock('@hooks/ui/use-gsap-entrance', () => ({
  useGsapTimeline: () => vi.fn(),
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

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    isLoading,
    label,
    onClick,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    isLoading?: boolean;
    label?: string;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled || isLoading} type="button" onClick={onClick}>
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => searchParamsMock,
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

describe('BrandContent behavior', () => {
  beforeEach(() => {
    findMeBrandsMock.mockReset();
    findMeOrganizationsMock.mockReset();
    handleStepCompleteMock.mockReset();
    patchMeMock.mockReset();
    patchSettingsMock.mockReset();
    pushMock.mockReset();
    renameWithOrganizationSyncMock.mockReset();
    resolveAuthTokenMock.mockReset();
    scrapeMock.mockReset();
    updateAccountTypeMock.mockReset();
    searchParamsMock.delete('auto');
    localStorageMock.clear();

    resolveAuthTokenMock.mockResolvedValue('api-token');
    // A default brand + org exist by the brand step for a normal signup, so the
    // resource routes can resolve their target ids (REST audit #1354).
    findMeBrandsMock.mockResolvedValue([{ id: 'brand_1' }]);
    findMeOrganizationsMock.mockResolvedValue([
      { id: 'org_1', label: 'Default Organization' },
    ]);
    handleStepCompleteMock.mockResolvedValue(undefined);
    patchMeMock.mockResolvedValue(undefined);
    patchSettingsMock.mockResolvedValue(undefined);
    scrapeMock.mockResolvedValue({ brandId: 'brand_1', success: true });
    renameWithOrganizationSyncMock.mockResolvedValue({ id: 'brand_1' });

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
  });

  it('prefills auto cloud handoff context and continues after confirmation', async () => {
    searchParamsMock.set('auto', 'true');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, 'acme.co');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandName, 'Acme');

    render(<BrandContent />);

    expect(scrapeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Founders' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(renameWithOrganizationSyncMock).toHaveBeenCalledWith(
        'brand_1',
        'Acme',
        {
          agentConfig: {
            voice: {
              audience: 'Founders',
              tone: 'Bold',
            },
          },
          description: [
            'Brand: Acme.',
            'Organization: Acme.',
            'Audience: Founders.',
            'Tone: Bold.',
          ].join('\n'),
          organizationLabel: 'Acme',
          text: [
            'Brand: Acme.',
            'Organization: Acme.',
            'Audience: Founders.',
            'Tone: Bold.',
          ].join('\n'),
        },
      );
    });

    expect(scrapeMock).toHaveBeenCalledWith('brand_1', {
      additionalNotes: 'Preferred tone: Bold',
      brandName: 'Acme',
      brandUrl: 'https://acme.co',
      organizationName: 'Acme',
      targetAudience: 'Founders',
    });
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain)).toBe(
      'acme.co',
    );
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName)).toBe(
      'Acme',
    );
    expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    expect(pushMock).not.toHaveBeenCalledWith('/onboarding/providers');
  });

  it('infers a brand name from the stored domain when cloud handoff has no brand name', async () => {
    searchParamsMock.set('auto', 'true');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, 'studio.acme.io');

    render(<BrandContent />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
        'Studio Acme',
      );
    });

    expect(screen.getByPlaceholderText('Your organization')).toHaveValue(
      'Studio Acme',
    );
    expect(scrapeMock).not.toHaveBeenCalled();
  });

  it('continues a freshly provisioned account through its scoped brand and organization', async () => {
    render(<BrandContent />);

    fireEvent.change(screen.getByPlaceholderText('Your name or brand'), {
      target: { value: 'Fresh Brand' },
    });
    fireEvent.change(screen.getByPlaceholderText('Your organization'), {
      target: { value: 'Fresh Organization' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(renameWithOrganizationSyncMock).toHaveBeenCalledWith(
        'brand_1',
        'Fresh Brand',
        expect.objectContaining({
          organizationLabel: 'Fresh Organization',
        }),
      );
    });
    expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('skips onboarding for the freshly provisioned organization and completes the gate', async () => {
    render(<BrandContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip Onboarding' }));

    await waitFor(() => {
      expect(patchSettingsMock).toHaveBeenCalledWith('org_1', {
        isFirstLogin: false,
      });
    });
    expect(patchMeMock).toHaveBeenCalledWith({
      isOnboardingCompleted: true,
    });
    expect(pushMock).toHaveBeenCalledWith('/');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an actionable error and allows retry when continuing fails', async () => {
    renameWithOrganizationSyncMock
      .mockRejectedValueOnce(new Error('forbidden'))
      .mockResolvedValueOnce({ id: 'brand_1' });
    render(<BrandContent />);

    fireEvent.change(screen.getByPlaceholderText('Your name or brand'), {
      target: { value: 'Fresh Brand' },
    });
    fireEvent.change(screen.getByPlaceholderText('Your organization'), {
      target: { value: 'Fresh Organization' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(
        "We couldn't save your workspace. Check your connection and try again.",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(renameWithOrganizationSyncMock).toHaveBeenCalledTimes(2);
    });
    expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an actionable error and allows retry when skipping fails', async () => {
    patchSettingsMock
      .mockRejectedValueOnce(new Error('forbidden'))
      .mockResolvedValueOnce(undefined);
    render(<BrandContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip Onboarding' }));

    expect(
      await screen.findByText(
        "We couldn't skip onboarding. Check your connection and try again.",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Skip Onboarding' }));

    await waitFor(() => {
      expect(patchSettingsMock).toHaveBeenCalledTimes(2);
    });
    expect(patchMeMock).toHaveBeenCalledWith({
      isOnboardingCompleted: true,
    });
    expect(pushMock).toHaveBeenCalledWith('/');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an actionable error when account type persistence fails', async () => {
    updateAccountTypeMock.mockRejectedValueOnce(new Error('forbidden'));
    render(<BrandContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Creator' }));

    expect(
      await screen.findByText(
        "We couldn't save your account type. Try selecting it again.",
      ),
    ).toBeVisible();
  });

  it('does not leave Continue loading when authentication is unavailable', async () => {
    render(<BrandContent />);
    await waitFor(() => {
      expect(findMeBrandsMock).toHaveBeenCalled();
    });
    resolveAuthTokenMock.mockResolvedValueOnce(null);

    fireEvent.change(screen.getByPlaceholderText('Your name or brand'), {
      target: { value: 'Fresh Brand' },
    });
    fireEvent.change(screen.getByPlaceholderText('Your organization'), {
      target: { value: 'Fresh Organization' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(
        "We couldn't save your workspace. Check your connection and try again.",
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('surfaces onboarding initialization failures without disabling the form', async () => {
    findMeBrandsMock.mockRejectedValueOnce(new Error('forbidden'));
    render(<BrandContent />);

    expect(
      await screen.findByText(
        "We couldn't load your workspace details. You can retry Continue or Skip Onboarding.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Skip Onboarding' }),
    ).toBeEnabled();
  });
});
