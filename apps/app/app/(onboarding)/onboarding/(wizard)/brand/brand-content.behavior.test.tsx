// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import BrandContent from './brand-content';

const {
  currentUserState,
  getTokenMock,
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
  setOnboardingAccountTypeMock,
  updateAccountTypeMock,
} = vi.hoisted(() => ({
  currentUserState: { currentUser: { email: '' } },
  getTokenMock: vi.fn(),
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
  setOnboardingAccountTypeMock: vi.fn(),
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

async function openBrandDetails() {
  fireEvent.click(screen.getByRole('button', { name: /^Business/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByPlaceholderText('Your name or brand');
}

function openVoice() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('Give it your voice.')).toBeVisible();
}

describe('BrandContent behavior', () => {
  beforeEach(() => {
    currentUserState.currentUser.email = '';
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
    updateAccountTypeMock.mockResolvedValue(undefined);
    setOnboardingAccountTypeMock.mockReset();
    searchParamsMock.delete('auto');
    searchParamsMock.delete('accountType');
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

  it('shows only the current questions and preserves answers going back', async () => {
    render(<BrandContent />);
    expect(screen.getByText('What do you create for?')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Founders' }),
    ).not.toBeInTheDocument();
    await openBrandDetails();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'first-brand.com' },
    });
    expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
      'First Brand',
    );
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'second-brand.io' },
    });
    expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
      'Second Brand',
    );
    fireEvent.change(screen.getByPlaceholderText('Your name or brand'), {
      target: { value: 'My Own Name' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'third-brand.io' },
    });
    expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
      'My Own Name',
    );
    openVoice();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Founders' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
      'My Own Name',
    );
    expect(screen.getByPlaceholderText('https://yoursite.com')).toHaveValue(
      'third-brand.io',
    );
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(renameWithOrganizationSyncMock).toHaveBeenCalledWith(
        'brand_1',
        'My Own Name',
        expect.objectContaining({
          organizationLabel: 'My Own Name',
          agentConfig: { voice: { audience: ['Founders'] } },
        }),
      ),
    );
  });

  it('keeps a name supplied before this visit when the website changes', async () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandName, 'Chosen Brand');
    render(<BrandContent />);
    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'different.com' },
    });
    expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
      'Chosen Brand',
    );
  });

  it('does not insert an unseen email suggestion after website confirmation', async () => {
    const view = render(<BrandContent />);
    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('Your name or brand'), {
      target: { value: 'No Website' },
    });
    openVoice();
    currentUserState.currentUser.email = 'owner@company.com';
    view.rerender(<BrandContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand'),
    );
    expect(scrapeMock).not.toHaveBeenCalled();
  });

  it('preserves a signup profile when skipping instead of completing the steps', async () => {
    searchParamsMock.set('accountType', 'EXPERT');
    render(<BrandContent />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip Onboarding' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(updateAccountTypeMock).toHaveBeenCalledWith('org_1', 'EXPERT');
    expect(setOnboardingAccountTypeMock).toHaveBeenCalledWith('EXPERT');
  });

  it('keeps skip available when saving the optional profile fails', async () => {
    render(<BrandContent />);
    fireEvent.click(screen.getByRole('button', { name: /^Business/ }));
    updateAccountTypeMock.mockRejectedValueOnce(new Error('unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Skip Onboarding' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(patchMeMock).toHaveBeenCalledWith({ isOnboardingCompleted: true });
  });

  it('suggests a work-email website without scraping before confirmation', async () => {
    currentUserState.currentUser.email = 'owner@acme-studio.com';
    render(<BrandContent />);
    await openBrandDetails();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('https://yoursite.com')).toHaveValue(
        'https://acme-studio.com',
      ),
    );
    expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
      'Acme Studio',
    );
    expect(scrapeMock).not.toHaveBeenCalled();
    expect(renameWithOrganizationSyncMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: '' },
    });
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand'),
    );
    expect(scrapeMock).not.toHaveBeenCalled();
  });

  it.each(['user@gmail.com', 'user@outlook.com', 'user@proton.me'])(
    'does not suggest a website from personal email %s',
    async (email) => {
      currentUserState.currentUser.email = email;
      render(<BrandContent />);
      await openBrandDetails();
      expect(screen.getByPlaceholderText('https://yoursite.com')).toHaveValue(
        '',
      );
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    },
  );

  it('preserves manual clearing and naming when prefill arrives late', async () => {
    let finishPrefill: (
      brands: Array<{
        id: string;
        label: string;
        links: Array<{ category: string; url: string }>;
      }>,
    ) => void = () => {};
    findMeBrandsMock.mockReturnValue(
      new Promise((resolve) => {
        finishPrefill = resolve;
      }),
    );
    currentUserState.currentUser.email = 'owner@company.com';
    render(<BrandContent />);
    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'mine.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByPlaceholderText('Your name or brand'), {
      target: { value: 'My Name' },
    });
    finishPrefill([
      {
        id: 'brand_1',
        label: 'Server Name',
        links: [{ category: 'WEBSITE', url: 'https://server.com' }],
      },
    ]);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
        'My Name',
      ),
    );
    expect(screen.getByPlaceholderText('https://yoursite.com')).toHaveValue('');
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand'),
    );
    expect(scrapeMock).not.toHaveBeenCalled();
  });

  it('keeps an existing website ahead of the email suggestion', async () => {
    currentUserState.currentUser.email = 'owner@acme.com';
    findMeBrandsMock.mockResolvedValue([
      {
        id: 'brand_1',
        label: 'Client Brand',
        links: [{ category: 'WEBSITE', url: 'https://client.com' }],
      },
    ]);
    render(<BrandContent />);
    await openBrandDetails();
    expect(screen.getByPlaceholderText('https://yoursite.com')).toHaveValue(
      'https://client.com',
    );
    expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
      'Client Brand',
    );
  });

  it('prefills auto cloud handoff context and continues after confirmation', async () => {
    searchParamsMock.set('auto', 'true');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, 'acme.co');
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandName, 'Acme');

    render(<BrandContent />);

    expect(scrapeMock).not.toHaveBeenCalled();

    await openBrandDetails();
    openVoice();
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
              audience: ['Founders'],
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
    await openBrandDetails();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Your name or brand')).toHaveValue(
        'Studio Acme',
      );
    });

    expect(
      screen.queryByPlaceholderText('Your organization'),
    ).not.toBeInTheDocument();
    expect(scrapeMock).not.toHaveBeenCalled();
  });

  it('continues a freshly provisioned account through its scoped brand and organization', async () => {
    render(<BrandContent />);

    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('Your name or brand'), {
      target: { value: 'Fresh Brand' },
    });
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(renameWithOrganizationSyncMock).toHaveBeenCalledWith(
        'brand_1',
        'Fresh Brand',
        expect.objectContaining({
          organizationLabel: 'Fresh Brand',
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

    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('Your name or brand'), {
      target: { value: 'Fresh Brand' },
    });
    openVoice();
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

  it('advances past a scrape warning instead of blocking Continue (#5080)', async () => {
    scrapeMock.mockResolvedValueOnce({
      brandId: 'brand_1',
      scrapeWarning: {
        code: 'BRAND_SCRAPE_SITE_UNREACHABLE',
        message: 'We could not reach that website.',
      },
      success: true,
    });
    render(<BrandContent />);

    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'unreachable-site.example' },
    });
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // The server already persisted a fallback brand profile and completed
    // onboarding for this response, so the wizard must advance — not loop
    // the user on Continue against a site that will always fail this way.
    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    });
    expect(scrapeMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        "We couldn't reach your site, but your brand setup continued — you can add details anytime.",
      ),
    ).toBeVisible();
  });

  it('keeps advancing on every retry when the same site keeps producing the same warning (#5080)', async () => {
    // A WAF-blocked or dead-DNS site produces the identical scrapeWarning on
    // every attempt. Before this fix, a persistent scrapeWarning blocked
    // Continue forever and re-ran the whole scrape/AI/persistence pipeline
    // each click; the fix must advance on the very first attempt.
    scrapeMock.mockResolvedValue({
      brandId: 'brand_1',
      scrapeWarning: {
        code: 'BRAND_SCRAPE_SITE_BLOCKED',
        message: 'That website blocked our request to read it.',
      },
      success: true,
    });
    render(<BrandContent />);

    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'always-blocked.example' },
    });
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    });
    expect(scrapeMock).toHaveBeenCalledTimes(1);
  });

  it('advances past an unclassified rejected scrape request instead of blocking Continue (#5080)', async () => {
    scrapeMock.mockRejectedValueOnce({
      errors: [
        {
          code: 'BRAND_SCRAPE_UNKNOWN',
          detail: 'Failed to setup brand',
          title: 'Brand Setup Failed',
        },
      ],
    });
    render(<BrandContent />);

    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'flaky-site.example' },
    });
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // BRAND_SCRAPE_UNKNOWN must not claim setup failed — it may well have
    // succeeded server-side (e.g. the client just gave up waiting).
    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    });
    expect(
      screen.getByText(
        'We hit an unexpected issue while analyzing your site, but your brand setup continued — you can add details anytime.',
      ),
    ).toBeVisible();
  });

  it('advances past a client-side scrape timeout (no JSON:API body) instead of blocking Continue', async () => {
    // The HTTP interceptor rejects a client-side timeout with a plain Error
    // carrying isTimeout — never a { errors: [...] } body.
    const timeoutError = Object.assign(
      new Error(
        'Request timed out. Please check your connection and try again.',
      ),
      { isTimeout: true },
    );
    scrapeMock.mockRejectedValueOnce(timeoutError);
    render(<BrandContent />);

    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'slow-site.example' },
    });
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    });
    expect(
      screen.getByText(
        'Your site took too long to respond, but your brand setup continued — you can add details anytime.',
      ),
    ).toBeVisible();
  });

  it('falls back to the generic scrape notice for an unrecognized or missing error code, and still advances', async () => {
    scrapeMock.mockRejectedValueOnce(new Error('network down'));
    render(<BrandContent />);

    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'flaky-site.example' },
    });
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    });
    expect(
      screen.getByText(
        'We hit an unexpected issue while analyzing your site, but your brand setup continued — you can add details anytime.',
      ),
    ).toBeVisible();
  });

  it('blocks only on an invalid URL, keeping the user on this step to fix it', async () => {
    scrapeMock.mockRejectedValueOnce({
      errors: [
        {
          code: 'BRAND_SCRAPE_INVALID_URL',
          detail: 'Invalid domain',
          title: 'Invalid URL',
        },
      ],
    });
    render(<BrandContent />);

    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('https://yoursite.com'), {
      target: { value: 'not a url' },
    });
    openVoice();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(
        "That website address doesn't look valid. Go back and fix it, then press Continue.",
      ),
    ).toBeVisible();
    expect(handleStepCompleteMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    scrapeMock.mockResolvedValueOnce({ brandId: 'brand_1', success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(handleStepCompleteMock).toHaveBeenCalledWith('brand');
    });
    expect(scrapeMock).toHaveBeenCalledTimes(2);
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

    fireEvent.click(
      screen.getByRole('button', {
        name: /^CreatorIndividual content creator or influencer$/,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
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

    await openBrandDetails();
    fireEvent.change(screen.getByPlaceholderText('Your name or brand'), {
      target: { value: 'Fresh Brand' },
    });
    openVoice();
    resolveAuthTokenMock.mockResolvedValueOnce(null);
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

  it('survives rapid remount while brand prefill is in flight', async () => {
    let resolveBrands: (value: Array<{ id: string; label: string }>) => void =
      () => {
        /* assigned when the pending prefill starts */
      };
    findMeBrandsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBrands = resolve;
        }),
    );

    const first = render(<BrandContent />);
    await waitFor(() => expect(findMeBrandsMock).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<BrandContent />);
    await waitFor(() => expect(findMeBrandsMock).toHaveBeenCalledTimes(2));

    expect(
      screen.queryByPlaceholderText('Your name or brand'),
    ).not.toBeInTheDocument();

    resolveBrands([{ id: 'brand_1', label: 'Acme' }]);

    await waitFor(() => expect(findMeBrandsMock).toHaveBeenCalledTimes(2));
    await openBrandDetails();
    expect(screen.getByDisplayValue('Acme')).toBeVisible();
  });
});
