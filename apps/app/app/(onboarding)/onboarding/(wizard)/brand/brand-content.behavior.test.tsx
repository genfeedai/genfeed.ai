// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import BrandContent from './brand-content';

const {
  findMeBrandsMock,
  findMeOrganizationsMock,
  pushMock,
  resolveAuthTokenMock,
  searchParamsMock,
  setAccountTypeMock,
  setupBrandMock,
  updateBrandNameMock,
} = vi.hoisted(() => ({
  findMeBrandsMock: vi.fn(),
  findMeOrganizationsMock: vi.fn(),
  pushMock: vi.fn(),
  resolveAuthTokenMock: vi.fn(),
  searchParamsMock: new URLSearchParams(),
  setAccountTypeMock: vi.fn(),
  setupBrandMock: vi.fn(),
  updateBrandNameMock: vi.fn(),
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
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

vi.mock('@services/onboarding/onboarding.service', () => ({
  OnboardingService: {
    getInstance: vi.fn(() => ({
      setupBrand: setupBrandMock,
      updateBrandName: updateBrandNameMock,
    })),
  },
}));

vi.mock('@services/onboarding/onboarding-funnel.service', () => ({
  OnboardingFunnelService: {
    getInstance: vi.fn(() => ({
      setAccountType: setAccountTypeMock,
    })),
  },
}));

vi.mock('@services/organization/users.service', () => ({
  UsersService: {
    getInstance: vi.fn(() => ({
      findMeBrands: findMeBrandsMock,
      findMeOrganizations: findMeOrganizationsMock,
    })),
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    label,
    onClick,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    label?: string;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} type="button" onClick={onClick}>
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
    pushMock.mockReset();
    resolveAuthTokenMock.mockReset();
    setAccountTypeMock.mockReset();
    setupBrandMock.mockReset();
    updateBrandNameMock.mockReset();
    searchParamsMock.delete('auto');
    localStorageMock.clear();

    resolveAuthTokenMock.mockResolvedValue('api-token');
    findMeBrandsMock.mockResolvedValue([]);
    findMeOrganizationsMock.mockResolvedValue([]);
    setupBrandMock.mockResolvedValue({});
    updateBrandNameMock.mockResolvedValue({});

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
  });

  it('auto-continues with stored cloud handoff brand context', async () => {
    searchParamsMock.set('auto', 'true');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, 'acme.co');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandName, 'Acme');

    render(<BrandContent />);

    await waitFor(() => {
      expect(setupBrandMock).toHaveBeenCalledWith({
        brandName: 'Acme',
        brandUrl: 'https://acme.co',
      });
    });

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain)).toBe(
      'acme.co',
    );
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName)).toBe(
      'Acme',
    );
    expect(pushMock).toHaveBeenCalledWith('/onboarding/providers');
    expect(updateBrandNameMock).not.toHaveBeenCalled();
  });

  it('infers a brand name from the stored domain when cloud handoff has no brand name', async () => {
    searchParamsMock.set('auto', 'true');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, 'studio.acme.io');

    render(<BrandContent />);

    await waitFor(() => {
      expect(setupBrandMock).toHaveBeenCalledWith({
        brandName: 'Studio Acme',
        brandUrl: 'https://studio.acme.io',
      });
    });

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName)).toBe(
      'Studio Acme',
    );
    expect(pushMock).toHaveBeenCalledWith('/onboarding/providers');
  });
});
