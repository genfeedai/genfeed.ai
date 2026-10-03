'use client';

import { CreditReservationStatus } from '@genfeedai/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreditHoldsPanel from './credit-holds-panel';

const fixture = vi.hoisted(() => ({
  list: vi.fn(),
  act: vi.fn(),
  getService: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => fixture.getService,
}));
vi.mock('@services/admin/credit-holds.service', () => ({
  AdminCreditHoldsService: { getInstance: vi.fn() },
}));
function report() {
  return {
    id: 'report',
    rows: [
      {
        id: 'hold',
        provider: 'heygen',
        status: CreditReservationStatus.RESERVED,
        amount: 12,
        canCharge: true,
        canRelease: true,
        blockedReason: null,
      },
    ],
    nextCursor: null,
  };
}
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CreditHoldsPanel
        organizationId="selected-org"
        organizationName="Selected organization"
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.list.mockResolvedValue(report());
  fixture.act.mockResolvedValue(report());
  fixture.getService.mockResolvedValue(fixture);
});
describe('operator media hold panel', () => {
  it('requires a reason and explicit confirmation and sends an org-scoped fixed-price action', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Charge quoted amount' }),
    );
    const confirm = screen.getByRole('button', { name: 'Confirm charge' });
    expect(confirm).toBeDisabled();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Credit hold recovery reason' }),
      { target: { value: 'Verified completion in HeyGen' } },
    );
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(fixture.act).toHaveBeenCalledWith('selected-org', 'hold', {
        action: 'charge',
        reason: 'Verified completion in HeyGen',
      }),
    );
    expect(fixture.list).toHaveBeenCalledWith(
      'selected-org',
      undefined,
      expect.any(AbortSignal),
    );
  });
  it('disables controls for Crun or quote-group holds', async () => {
    const response = report();
    response.rows[0].canCharge = false;
    response.rows[0].canRelease = false;
    fixture.list.mockResolvedValue(response);
    show();
    expect(
      await screen.findByRole('button', { name: 'Charge quoted amount' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Release hold' })).toBeDisabled();
  });
  it('keeps an actionable failure visible when a recovery is rejected', async () => {
    fixture.act.mockRejectedValue(new Error('Conflict'));
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Release hold' }),
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Credit hold recovery reason' }),
      { target: { value: 'Provider job failed' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refresh the holds',
    );
  });
});
