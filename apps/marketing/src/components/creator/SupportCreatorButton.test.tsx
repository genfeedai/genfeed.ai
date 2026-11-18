import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupportCreatorButton from './SupportCreatorButton';

const getSignedInBetterAuthToken = vi.fn<() => Promise<string | null>>();
const getTipTarget = vi.fn();
const sendTip = vi.fn();

vi.mock('@genfeedai/auth-client', () => ({ getSignedInBetterAuthToken }));
vi.mock('@services/billing/creator-payments.service', () => ({
  CreatorPaymentsService: {
    getInstance: () => ({ getTipTarget, sendTip }),
  },
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.genfeed.ai' } },
}));

const ADA = {
  brandId: 'brand-1',
  handle: 'ada',
  isTippable: true,
  label: 'Ada',
};

async function openModal(articleId?: string) {
  render(<SupportCreatorButton articleId={articleId} handle="ada" />);
  fireEvent.click(screen.getByRole('button', { name: 'Support @ada' }));
  return screen.findByRole('dialog', {}, { timeout: 5000 });
}

beforeEach(() => {
  getSignedInBetterAuthToken.mockReset();
  getTipTarget.mockReset();
  sendTip.mockReset();
});

describe('SupportCreatorButton', () => {
  it('opens a modal instead of leaving the page', async () => {
    getSignedInBetterAuthToken.mockResolvedValue('jwt');
    getTipTarget.mockResolvedValue(ADA);

    await openModal();

    expect(
      await screen.findByRole('heading', { name: 'Support Ada' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Support @ada' })).toBeNull();
  });

  it('sends a signed-out reader to sign in, back to the support page', async () => {
    getSignedInBetterAuthToken.mockResolvedValue(null);

    await openModal('article-1');

    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/support/ada?article=article-1',
    );
  });

  it('sends the chosen amount and shows the new balance', async () => {
    getSignedInBetterAuthToken.mockResolvedValue('jwt');
    getTipTarget.mockResolvedValue(ADA);
    sendTip.mockResolvedValue({
      amount: 100,
      balanceAfter: 1140,
      creatorLabel: 'Ada',
      transferId: 'transfer-1',
      wasApplied: true,
    });

    await openModal();
    fireEvent.click(await screen.findByRole('radio', { name: '100' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send 100 credits' }));

    expect(
      await screen.findByText(
        '100 credits sent to Ada. Your balance is now 1,140.',
      ),
    ).toBeInTheDocument();
  });

  it('offers to buy credits when the balance is too low', async () => {
    getSignedInBetterAuthToken.mockResolvedValue('jwt');
    getTipTarget.mockResolvedValue(ADA);
    sendTip.mockRejectedValue({
      response: { data: { errors: [{ code: 'INSUFFICIENT_CREDITS' }] } },
    });

    await openModal();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send 50 credits' }),
    );

    expect(await screen.findByText('Not enough credits')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Buy credits' }),
    ).toBeInTheDocument();
  });

  it('does not let a reader tip their own workspace', async () => {
    getSignedInBetterAuthToken.mockResolvedValue('jwt');
    getTipTarget.mockResolvedValue({ ...ADA, isTippable: false });

    await openModal();

    expect(
      await screen.findByText('This is your own workspace'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull();
  });
});
