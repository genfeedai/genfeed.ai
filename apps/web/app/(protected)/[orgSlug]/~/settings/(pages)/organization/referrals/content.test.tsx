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

const { brandState, errorMock, getMineMock, identityState, successMock } =
  vi.hoisted(() => ({
    brandState: { organizationId: 'org_1' },
    errorMock: vi.fn(),
    getMineMock: vi.fn(),
    identityState: {
      orgId: 'org_1',
      sessionId: 'session_1',
      userId: 'user_1',
    },
    successMock: vi.fn(),
  }));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => identityState,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ getMine: getMineMock }),
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

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expectedShareUrl);
      expect(successMock).toHaveBeenCalledTimes(1);
    });
    // The clipboard service owns the one toast; the page adds none.
    expect(successMock).toHaveBeenCalledWith('Copied to clipboard');
    expect(errorMock).not.toHaveBeenCalled();
  });

  it('shows only the failure toast when the copy fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsReferralsPage />
      </QueryClientProvider>,
    );
    await screen.findByLabelText('Affiliate link');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    document.execCommand = vi.fn().mockReturnValue(false);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith('Copy to clipboard failed');
    });
    expect(successMock).not.toHaveBeenCalled();
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
});
