import '@testing-library/jest-dom/vitest';
import type { IWarmupAccount } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProvisionConciergeDialog from './provision-concierge-dialog';

const mocks = vi.hoisted(() => ({
  createWarmupAccount: vi.fn(),
  notifications: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createWarmupAccount: mocks.createWarmupAccount,
  }),
}));

vi.mock('@services/admin/warmup-accounts.service', () => ({
  AdminWarmupAccountsService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => mocks.notifications },
}));

const created = { id: 'warmup_1', status: 'PROVISIONED' } as IWarmupAccount;

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Owns the open state the way the organizations page does, and records what it is told. */
function Harness({ provisioned }: { provisioned: IWarmupAccount[] }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <ProvisionConciergeDialog
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onProvisioned={(account) => provisioned.push(account)}
    />
  );
}

function fillLead(email: string) {
  fill(/Lead email/, email);
  fill(/Organization/, 'Acme Growth');
  fill(/First brand/, 'Acme');
}

function submit() {
  fireEvent.click(
    screen.getByRole('button', { name: /Provision concierge account/i }),
  );
}

describe('ProvisionConciergeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createWarmupAccount.mockResolvedValue(created);
  });

  it('renders nothing while closed', () => {
    render(
      <ProvisionConciergeDialog
        isOpen={false}
        onClose={() => undefined}
        onProvisioned={() => undefined}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('provisions the account from the lead details, reports it and closes', async () => {
    const provisioned: IWarmupAccount[] = [];
    render(<Harness provisioned={provisioned} />);

    fillLead('lead@example.com');
    submit();

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(provisioned).toEqual([created]);
    expect(mocks.createWarmupAccount.mock.calls).toEqual([
      [
        {
          brandName: 'Acme',
          guidance: undefined,
          leadEmail: 'lead@example.com',
          leadFirstName: undefined,
          leadLastName: undefined,
          organizationName: 'Acme Growth',
          websiteUrl: undefined,
        },
      ],
    ]);
    expect(mocks.notifications.success.mock.calls).toEqual([
      ['Concierge account provisioned'],
    ]);
  });

  it('refuses a blank lead email before provisioning anything', () => {
    const provisioned: IWarmupAccount[] = [];
    render(<Harness provisioned={provisioned} />);

    fillLead('   ');
    submit();

    expect(mocks.createWarmupAccount.mock.calls).toHaveLength(0);
    expect(provisioned).toEqual([]);
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('keeps the dialog open and says so when provisioning fails', async () => {
    mocks.createWarmupAccount.mockRejectedValue(new Error('boom'));
    const provisioned: IWarmupAccount[] = [];
    render(<Harness provisioned={provisioned} />);

    fillLead('lead@example.com');
    submit();

    await waitFor(() =>
      expect(mocks.notifications.error.mock.calls).toEqual([
        ['Failed to create concierge account'],
      ]),
    );
    expect(provisioned).toEqual([]);
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});
