// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import SuccessContent from './success-content';

const getTokenMock = vi.fn();
const sessionTouchMock = vi.fn();
const userReloadMock = vi.fn();
const resolveClerkTokenMock = vi.fn();
const completeFunnelMock = vi.fn();
const patchSettingsMock = vi.fn();
const assignMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: getTokenMock,
  }),
  useSession: () => ({
    session: {
      touch: sessionTouchMock,
    },
  }),
  useUser: () => ({
    user: {
      reload: userReloadMock,
    },
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: {
      organization: { slug: 'acme-org' },
      slug: 'primary-brand',
    },
  }),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: {
      id: 'user-123',
    },
  }),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: (...args: unknown[]) => resolveClerkTokenMock(...args),
}));

vi.mock('@hooks/ui/use-gsap-entrance', () => ({
  useGsapTimeline: () => vi.fn(),
}));

vi.mock('@services/onboarding/onboarding-funnel.service', () => ({
  OnboardingFunnelService: {
    getInstance: vi.fn(() => ({
      completeFunnel: completeFunnelMock,
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

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => (
    <div data-testid="next-image">{alt ?? 'image'}</div>
  ),
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

describe('SuccessContent behavior', () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    sessionTouchMock.mockReset();
    userReloadMock.mockReset();
    resolveClerkTokenMock.mockReset();
    completeFunnelMock.mockReset();
    patchSettingsMock.mockReset();
    assignMock.mockReset();
    localStorageMock.clear();

    resolveClerkTokenMock.mockResolvedValue('api-token');
    completeFunnelMock.mockResolvedValue(undefined);
    sessionTouchMock.mockResolvedValue(undefined);
    userReloadMock.mockResolvedValue(undefined);

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

    localStorage.setItem(
      ONBOARDING_STORAGE_KEYS.previewUrl,
      'https://cdn.genfeed.ai/preview.png',
    );
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, 'acme.co');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandName, 'Acme');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.accessMode, 'cloud');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.source, 'oss-onboarding');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.contentType, 'image');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cleans onboarding storage keys and routes into the workspace after completion', async () => {
    render(<SuccessContent />);

    await waitFor(() => {
      expect(screen.getByText('Enter Workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enter Workspace' }));

    await waitFor(() => {
      expect(completeFunnelMock).toHaveBeenCalledTimes(1);
    });

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.previewUrl)).toBeNull();
    expect(
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain),
    ).toBeNull();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName)).toBeNull();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.accessMode)).toBeNull();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.source)).toBeNull();
    expect(
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.contentType),
    ).toBeNull();
    expect(assignMock).toHaveBeenCalledWith(
      '/acme-org/primary-brand/workspace/overview',
    );
    expect(patchSettingsMock).not.toHaveBeenCalled();
  });

  it('saves selected content preferences before completing onboarding', async () => {
    render(<SuccessContent />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Images' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Images' }));
    fireEvent.click(screen.getByRole('button', { name: 'Music' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enter Workspace' }));

    await waitFor(() => {
      expect(patchSettingsMock).toHaveBeenCalledWith('user-123', {
        contentPreferences: ['image', 'music'],
      });
    });

    expect(completeFunnelMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith(
      '/acme-org/primary-brand/workspace/overview',
    );
  });
});
