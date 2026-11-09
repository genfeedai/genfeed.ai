// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  CreatorSubscriptionStatus,
  CreditTransferKind,
} from '@genfeedai/contracts';
import type { ICreatorEarnings } from '@genfeedai/contracts/interfaces/billing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsEarningsPage from './content';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const {
  getEarningsMock,
  listMySubscriptionsMock,
  listSubscriptionPlansMock,
  setCancelAtPeriodEndMock,
  updateSubscriptionPlanMock,
} = vi.hoisted(() => ({
  getEarningsMock: vi.fn(),
  listMySubscriptionsMock: vi.fn(),
  listSubscriptionPlansMock: vi.fn(),
  setCancelAtPeriodEndMock: vi.fn(),
  updateSubscriptionPlanMock: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org_1' }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ sessionId: 'session_1', userId: 'user_1' }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getEarnings: getEarningsMock,
    listMySubscriptions: listMySubscriptionsMock,
    listSubscriptionPlans: listSubscriptionPlansMock,
    setCancelAtPeriodEnd: setCancelAtPeriodEndMock,
    updateSubscriptionPlan: updateSubscriptionPlanMock,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

const EARNINGS: ICreatorEarnings = {
  byArticle: [
    {
      articleId: 'article_1',
      count: 2,
      label: 'How I plan a week of posts',
      netAmount: 50,
    },
  ],
  bySource: [
    { count: 3, kind: CreditTransferKind.TIP, netAmount: 65 },
    { count: 0, kind: CreditTransferKind.SUBSCRIPTION, netAmount: 0 },
    { count: 0, kind: CreditTransferKind.UNLOCK, netAmount: 0 },
  ],
  earnedBalance: 40,
  received: [
    {
      createdAt: '2026-11-08T10:00:00.000Z',
      description: 'Tip from Ada',
      feeAmount: 0,
      grossAmount: 15,
      kind: CreditTransferKind.TIP,
      message: 'Keep going',
      netAmount: 15,
      transferId: 'transfer_1',
    },
  ],
  sent: [],
  thisMonth: 65,
  totalEarned: 165,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsEarningsPage />
    </QueryClientProvider>,
  );
}

describe('SettingsEarningsPage', () => {
  beforeEach(() => {
    getEarningsMock.mockReset();
    listMySubscriptionsMock.mockReset().mockResolvedValue([]);
    listSubscriptionPlansMock.mockReset().mockResolvedValue([]);
    setCancelAtPeriodEndMock.mockReset();
    updateSubscriptionPlanMock.mockReset();
  });

  it('shows earned totals, the split by source and article, and each payment', async () => {
    getEarningsMock.mockResolvedValue(EARNINGS);
    renderPage();

    expect(await screen.findByText('Tip from Ada')).toBeInTheDocument();
    expect(screen.getByText('Keep going')).toBeInTheDocument();
    expect(screen.getByText('40 credits')).toBeInTheDocument();
    expect(screen.getByText('165 credits')).toBeInTheDocument();
    expect(screen.getByText('Tips · 3 payments')).toBeInTheDocument();
    expect(screen.getByText('Unlocks · 0 payments')).toBeInTheDocument();
    expect(screen.getByText('How I plan a week of posts')).toBeInTheDocument();
    expect(
      screen.getByText('Your team has not paid any creator yet.'),
    ).toBeInTheDocument();
  });

  it('lets the creator price a public profile and the reader cancel a subscription', async () => {
    getEarningsMock.mockResolvedValue(EARNINGS);
    listSubscriptionPlansMock.mockResolvedValue([
      {
        activeSubscribers: 2,
        brandId: 'brand_1',
        handle: 'ada',
        isEnabled: false,
        label: 'Ada Writes',
        monthlyPriceCredits: null,
      },
    ]);
    listMySubscriptionsMock.mockResolvedValue([
      {
        brandId: 'brand_9',
        cancelAtPeriodEnd: false,
        creatorHandle: 'bo',
        creatorLabel: 'Bo Draws',
        currentPeriodEnd: '2026-12-09T10:00:00.000Z',
        id: 'sub_1',
        priceCredits: 40,
        status: CreatorSubscriptionStatus.ACTIVE,
      },
    ]);
    updateSubscriptionPlanMock.mockResolvedValue(undefined);
    setCancelAtPeriodEndMock.mockResolvedValue(undefined);
    renderPage();

    expect(
      await screen.findByText('@ada · 2 paying subscribers'),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Monthly price for Ada Writes' }),
      {
        target: { value: '25' },
      },
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Open to new subscribers' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(updateSubscriptionPlanMock).toHaveBeenCalledWith('brand_1', {
        isEnabled: true,
        monthlyPriceCredits: 25,
      });
    });

    expect(
      await screen.findByText(/Bo Draws · renews .* for 40 credits/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(setCancelAtPeriodEndMock).toHaveBeenCalledWith('sub_1', true);
    });
  });

  it('offers a retry when earnings fail to load', async () => {
    getEarningsMock.mockRejectedValue(new Error('down'));
    renderPage();

    expect(
      await screen.findByText('Earnings did not load'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });
});
