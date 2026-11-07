// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsReferralsPage from './content';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const {
  brandState,
  copyMock,
  createCodeMock,
  errorMock,
  getMineMock,
  identityState,
  setCodeActiveMock,
  successMock,
} = vi.hoisted(() => ({
  brandState: {
    brands: [{ id: 'brand_1', label: 'Shayla', slug: 'itsshaylamonroe' }],
    organizationId: 'org_1',
  },
  copyMock: vi.fn(),
  createCodeMock: vi.fn(),
  errorMock: vi.fn(),
  getMineMock: vi.fn(),
  identityState: {
    orgId: 'org_1',
    sessionId: 'session_1',
    userId: 'user_1',
  },
  setCodeActiveMock: vi.fn(),
  successMock: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => identityState,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createCode: createCodeMock,
    getMine: getMineMock,
    setCodeActive: setCodeActiveMock,
  }),
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: copyMock }) },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: errorMock, success: successMock }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

describe('SettingsReferralsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMineMock.mockResolvedValue({
      code: 'frend2345xyz',
      codes: [
        {
          brandId: null,
          brandLabel: null,
          brandSlug: null,
          code: 'frend2345xyz',
          convertedCount: 1,
          earnedCredits: 500,
          id: 'code_1',
          isActive: true,
          isPrimary: true,
          pendingCredits: 250,
          referralCount: 1,
          shareUrl: '/sign-up?ref=frend2345xyz',
        },
        {
          brandId: 'brand_1',
          brandLabel: 'Shayla',
          brandSlug: 'itsshaylamonroe',
          code: 'itsshaylamonroe',
          convertedCount: 0,
          earnedCredits: 0,
          id: 'code_2',
          isActive: true,
          isPrimary: false,
          pendingCredits: 0,
          referralCount: 1,
          shareUrl: '/sign-up?ref=itsshaylamonroe',
        },
      ],
      convertedCount: 1,
      earnedCredits: 500,
      id: 'code_1',
      isDeleted: false,
      pendingCredits: 250,
      recentRewards: [
        {
          createdAt: '2026-08-30T00:00:00.000Z',
          id: 'reward_granted',
          rewardCredits: 500,
          status: 'GRANTED',
        },
        {
          createdAt: '2026-08-29T00:00:00.000Z',
          id: 'reward_reversed',
          rewardCredits: 250,
          status: 'REVERSED',
        },
      ],
      referralCount: 2,
      reversedCredits: 0,
      rewardRatePercent: 10,
      rewardWindowMonths: 12,
      settlementDelayDays: 7,
      shareUrl: '/sign-up?ref=frend2345xyz',
    });
  });

  it('shows aggregate rewards and copies the opaque share link', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsReferralsPage />
      </QueryClientProvider>,
    );

    const input = await screen.findByLabelText('Affiliate link');
    const expectedShareUrl = `${window.location.origin}/sign-up?ref=frend2345xyz`;
    await waitFor(() => {
      expect(input).toHaveValue(expectedShareUrl);
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ['referral-program', 'user_1', 'session_1', 'org_1'],
      }),
    ).toBeDefined();
    expect(screen.getByText('500')).toBeInTheDocument();
    // Headline and description are separate blocks, never one run-on line.
    expect(screen.getByText('Earn 10% in credits').tagName).toBe('P');
    expect(screen.getByText(/Share your link\. You earn 10%/).tagName).toBe(
      'P',
    );
    expect(screen.getByText('Granted')).toBeInTheDocument();
    expect(screen.getByText('Reversed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => {
      expect(copyMock).toHaveBeenCalledWith(expectedShareUrl);
    });
    expect(successMock).toHaveBeenCalledWith('Affiliate link copied');
  });

  it('shows a recoverable error instead of zero financial data', async () => {
    getMineMock.mockRejectedValueOnce(new Error('API unavailable'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsReferralsPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText('Affiliate rewards unavailable'),
    ).toBeVisible();
    expect(screen.queryByText('Earned')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(getMineMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Earned')).toBeVisible();
    });
  });
  it('lists every code with its brand and sign-ups', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsReferralsPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('itsshaylamonroe')).toBeVisible();
    expect(screen.getByText('Primary')).toBeVisible();
    expect(screen.getAllByText('Shayla').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('switch', {
        name: 'Accept sign-ups through frend2345xyz',
      }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Accept sign-ups through itsshaylamonroe',
      }),
    );
    await waitFor(() => {
      expect(setCodeActiveMock).toHaveBeenCalledWith('code_2', false);
    });
  });

  it('adds a named code and shows the reason when it is refused', async () => {
    createCodeMock.mockRejectedValueOnce(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { data: { message: 'That code is already taken.' } },
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsReferralsPage />
      </QueryClientProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Code'), {
      target: { value: 'launch10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add code' }));

    await waitFor(() => {
      expect(createCodeMock).toHaveBeenCalledWith({ code: 'launch10' });
      expect(errorMock).toHaveBeenCalledWith('That code is already taken.');
    });
  });
});
