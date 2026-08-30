// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReferralHubCard from './referral-hub-card';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const { copyMock, getMineMock, successMock } = vi.hoisted(() => ({
  copyMock: vi.fn(),
  getMineMock: vi.fn(),
  successMock: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ getMine: getMineMock }),
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: copyMock }) },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ success: successMock }) },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

describe('ReferralHubCard', () => {
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
        <ReferralHubCard />
      </QueryClientProvider>,
    );

    const input = await screen.findByLabelText('Referral link');
    const expectedShareUrl = `${window.location.origin}/sign-up?ref=frend2345xyz`;
    await waitFor(() => {
      expect(input).toHaveValue(expectedShareUrl);
    });
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Granted')).toBeInTheDocument();
    expect(screen.getByText('Reversed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => {
      expect(copyMock).toHaveBeenCalledWith(expectedShareUrl);
    });
    expect(successMock).toHaveBeenCalledWith('Referral link copied');
  });
});
