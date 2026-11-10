// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { CreatorSubscriptionStatus } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreatorSubscriptionCard from './creator-subscription-card';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const { getOfferMock, getService, getTargetMock, subscribeMock } = vi.hoisted(
  () => {
    const mocks = {
      getOfferMock: vi.fn(),
      getTargetMock: vi.fn(),
      subscribeMock: vi.fn(),
    };
    // Stable like the real hook: the effect loads the offer once.
    const service = {
      getSubscriptionOffer: mocks.getOfferMock,
      getTipTarget: mocks.getTargetMock,
      subscribe: mocks.subscribeMock,
    };
    return { ...mocks, getService: async () => service };
  },
);

vi.mock('@genfeedai/hooks/navigation/use-route-params', () => ({
  useRouteParams: () => ({ handle: 'ada', orgSlug: 'acme' }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const SUBSCRIPTION = {
  brandId: 'brand_1',
  cancelAtPeriodEnd: false,
  creatorHandle: 'ada',
  creatorLabel: 'Ada Writes',
  currentPeriodEnd: '2026-12-09T10:00:00.000Z',
  id: 'sub_1',
  priceCredits: 40,
  status: CreatorSubscriptionStatus.ACTIVE,
};

describe('CreatorSubscriptionCard', () => {
  beforeEach(() => {
    getOfferMock.mockReset();
    subscribeMock.mockReset();
    getTargetMock.mockReset().mockResolvedValue({
      brandId: 'brand_1',
      handle: 'ada',
      isTippable: true,
      label: 'Ada Writes',
    });
  });

  it('subscribes the reader at the monthly price and shows the renewal date', async () => {
    getOfferMock.mockResolvedValue({
      monthlyPriceCredits: 40,
      subscription: null,
    });
    subscribeMock.mockResolvedValue(SUBSCRIPTION);
    render(<CreatorSubscriptionCard />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Subscribe for 40 credits a month',
      }),
    );

    expect(
      await screen.findByText('You subscribe to Ada Writes'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Renews on December \d+, 2026 for 40 credits\./),
    ).toBeInTheDocument();
    expect(subscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'ada' }),
    );
  });

  it('asks for purchased credits when the workspace cannot pay', async () => {
    getOfferMock.mockResolvedValue({
      monthlyPriceCredits: 40,
      subscription: null,
    });
    subscribeMock.mockRejectedValue({
      response: {
        data: { errors: [{ code: 'CREDIT_TRANSFER_REQUIRES_PURCHASE' }] },
      },
    });
    render(<CreatorSubscriptionCard />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Subscribe for 40 credits a month',
      }),
    );

    expect(await screen.findByText('Not enough credits')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buy credits' })).toHaveAttribute(
      'href',
      '/acme/~/settings/credits',
    );
  });

  it('renders nothing when the creator has no paid subscription', async () => {
    getOfferMock.mockResolvedValue({
      monthlyPriceCredits: null,
      subscription: null,
    });
    const { container } = render(<CreatorSubscriptionCard />);

    await waitFor(() => expect(getOfferMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
