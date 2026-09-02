import '@testing-library/jest-dom/vitest';
import type {
  IWarmupAccount,
  IWarmupInvitation,
  IWarmupInvitationStatus,
} from '@genfeedai/contracts/interfaces';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WarmupAccountsPage from './warmup-accounts-page';

const mocks = vi.hoisted(() => ({
  createWarmupAccount: vi.fn(),
  getAuthedService: vi.fn(),
  getWarmupAccounts: vi.fn(),
  inspectInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  sendInvitation: vi.fn(),
  notifications: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getAuthedService,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@services/admin/warmup-accounts.service', () => ({
  AdminWarmupAccountsService: {
    getInstance: () => ({
      createWarmupAccount: mocks.createWarmupAccount,
      getWarmupAccounts: mocks.getWarmupAccounts,
      inspectInvitation: mocks.inspectInvitation,
      resendInvitation: mocks.resendInvitation,
      revokeInvitation: mocks.revokeInvitation,
      sendInvitation: mocks.sendInvitation,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => mocks.notifications,
  },
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    headerTabs,
    label,
  }: {
    children: ReactNode;
    headerTabs: {
      activeTab: string;
      onTabChange: (tab: string) => void;
      tabs: Array<{ id: string; label: string }>;
    };
    label: string;
  }) => (
    <section>
      <h1>{label}</h1>
      <nav>
        {headerTabs.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={headerTabs.activeTab === tab.id}
            onClick={() => headerTabs.onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {children}
    </section>
  ),
}));

const pendingInvitation: IWarmupInvitation = {
  acceptedAt: null,
  createdAt: '2026-06-29T10:01:00.000Z',
  email: 'lead@example.com',
  expiresAt: '2026-07-06T10:01:00.000Z',
  id: 'invite_1',
  invitedByUserId: 'operator_1',
  organizationId: 'org_1',
  revokedAt: null,
  roleKey: 'member',
  status: 'pending',
  updatedAt: '2026-06-29T10:01:00.000Z',
};

const account: IWarmupAccount = {
  auditEvents: [],
  brandId: 'brand_1',
  brandName: 'Acme',
  createdAt: '2026-06-29T10:00:00.000Z',
  customerUserId: 'customer_1',
  diagnostics: {
    steps: [
      {
        message: 'Created pending customer invitation.',
        status: 'done' as const,
        timestamp: '2026-06-29T10:01:00.000Z',
      },
    ],
  },
  id: 'warmup_1',
  invitation: pendingInvitation,
  invitationId: 'invite_1',
  leadEmail: 'lead@example.com',
  operatorUserId: 'operator_1',
  organizationId: 'org_1',
  organizationName: 'Acme Growth',
  status: 'INVITED' as const,
  updatedAt: '2026-06-29T10:01:00.000Z',
};

function makeInvitation(
  status: IWarmupInvitationStatus,
  overrides: Partial<IWarmupInvitation> = {},
): IWarmupInvitation {
  return {
    ...pendingInvitation,
    status,
    ...overrides,
  };
}

function makeAccount(overrides: Partial<IWarmupAccount> = {}): IWarmupAccount {
  return {
    ...account,
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}

async function findEnabledButton(name: RegExp | string): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('WarmupAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthedService.mockResolvedValue({
      createWarmupAccount: mocks.createWarmupAccount,
      getWarmupAccounts: mocks.getWarmupAccounts,
      inspectInvitation: mocks.inspectInvitation,
      resendInvitation: mocks.resendInvitation,
      revokeInvitation: mocks.revokeInvitation,
      sendInvitation: mocks.sendInvitation,
    });
    mocks.getWarmupAccounts.mockResolvedValue([account]);
    mocks.createWarmupAccount.mockResolvedValue(account);
    mocks.inspectInvitation.mockResolvedValue(account);
    mocks.sendInvitation.mockResolvedValue({
      ...account,
      invitation: { ...pendingInvitation, status: 'delivered' as const },
    });
    mocks.resendInvitation.mockResolvedValue({
      ...account,
      invitation: { ...pendingInvitation, status: 'delivered' as const },
    });
    mocks.revokeInvitation.mockResolvedValue({
      ...account,
      invitation: {
        ...pendingInvitation,
        revokedAt: '2026-06-29T10:05:00.000Z',
        status: 'revoked' as const,
      },
    });
  });

  it('loads and renders account progress on the accounts tab', async () => {
    render(<WarmupAccountsPage defaultTab="accounts" />);

    await waitFor(() => {
      expect(mocks.getWarmupAccounts).toHaveBeenCalledTimes(1);
    });

    expect(screen.getAllByText('Acme Growth').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Invited').length).toBeGreaterThan(0);
    expect(screen.getByText('org_1')).toBeDefined();
    expect(
      screen.getByText('Created pending customer invitation.'),
    ).toBeDefined();
  });

  it('submits the create form and selects the returned account', async () => {
    render(<WarmupAccountsPage />);

    fireEvent.change(screen.getByLabelText(/Lead email/), {
      target: { value: 'lead@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Organization/), {
      target: { value: 'Acme Growth' },
    });
    fireEvent.change(screen.getByLabelText(/First brand/), {
      target: { value: 'Acme' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Provision warm-up account/i }),
    );

    await waitFor(() => {
      expect(mocks.createWarmupAccount).toHaveBeenCalledWith({
        brandName: 'Acme',
        guidance: undefined,
        leadEmail: 'lead@example.com',
        leadFirstName: undefined,
        leadLastName: undefined,
        organizationName: 'Acme Growth',
        websiteUrl: undefined,
      });
    });

    expect(mocks.notifications.success).toHaveBeenCalledWith(
      'Warm-up account provisioned',
    );
    expect(screen.getByText('invite_1')).toBeDefined();
  });

  it('offers send only when an eligible account has no invitation', async () => {
    const accountWithoutInvitation = makeAccount({
      invitation: undefined,
      invitationId: undefined,
      status: 'PROVISIONED',
    });
    mocks.getWarmupAccounts.mockResolvedValue([accountWithoutInvitation]);
    mocks.inspectInvitation.mockResolvedValue(accountWithoutInvitation);

    render(<WarmupAccountsPage defaultTab="accounts" />);

    await waitFor(() => {
      expect(mocks.inspectInvitation).toHaveBeenCalledWith(
        'warmup_1',
        expect.any(AbortSignal),
      );
    });

    expect(
      screen.getByRole('button', { name: /^Send invitation$/i }),
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: /^Resend invitation$/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Retry delivery$/i }),
    ).toBeNull();
  });

  it('offers resend instead of send for an existing pending invitation', async () => {
    render(<WarmupAccountsPage defaultTab="accounts" />);

    await waitFor(() => {
      expect(mocks.inspectInvitation).toHaveBeenCalledWith(
        'warmup_1',
        expect.any(AbortSignal),
      );
    });

    expect(screen.getByText('Pending')).toBeDefined();
    expect(
      screen.getByRole('button', { name: /^Resend invitation$/i }),
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: /^Send invitation$/i }),
    ).toBeNull();
  });

  it.each([
    ['delivered', 'Delivered', 'Resend invitation'],
    ['delivery-failed', 'Delivery failed', 'Retry delivery'],
    ['expired', 'Expired', 'Resend invitation'],
  ] as const)(
    'offers only the recovery action for an existing %s invitation',
    async (invitationStatus, statusLabel, actionLabel) => {
      const invitationAccount = makeAccount({
        invitation: makeInvitation(invitationStatus),
      });
      mocks.getWarmupAccounts.mockResolvedValue([invitationAccount]);
      mocks.inspectInvitation.mockResolvedValue(invitationAccount);

      render(<WarmupAccountsPage defaultTab="accounts" />);

      expect(await screen.findByText(statusLabel)).toBeDefined();
      expect(screen.getByRole('button', { name: actionLabel })).toBeDefined();
      expect(
        screen.queryByRole('button', { name: /^Send invitation$/i }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', {
          name:
            actionLabel === 'Retry delivery'
              ? /^Resend invitation$/i
              : /^Retry delivery$/i,
        }),
      ).toBeNull();
    },
  );

  it('resends an existing pending invitation through the resend action', async () => {
    render(<WarmupAccountsPage defaultTab="accounts" />);

    const resendButton = await findEnabledButton(/^Resend invitation$/i);
    fireEvent.click(resendButton);

    await waitFor(() => {
      expect(mocks.resendInvitation).toHaveBeenCalledWith(
        'warmup_1',
        expect.any(AbortSignal),
      );
    });
    expect(mocks.sendInvitation).not.toHaveBeenCalled();
  });

  it('sends an invitation from server state and does not mark success when dispatch fails', async () => {
    const accountWithoutInvitation = makeAccount({
      invitation: undefined,
      invitationId: undefined,
      status: 'PROVISIONED',
    });
    mocks.getWarmupAccounts.mockResolvedValue([accountWithoutInvitation]);
    mocks.inspectInvitation.mockResolvedValue(accountWithoutInvitation);
    mocks.sendInvitation.mockResolvedValueOnce({
      ...account,
      diagnostics: {
        error:
          'Invitation email could not be delivered. Retry send when email delivery is available.',
        steps: [
          {
            message:
              'Invitation email dispatch failed. The invitation remains retryable.',
            status: 'failed' as const,
            timestamp: '2026-06-29T10:02:00.000Z',
          },
        ],
      },
      invitation: {
        ...pendingInvitation,
        status: 'delivery-failed' as const,
      },
    });

    render(<WarmupAccountsPage defaultTab="accounts" />);

    await waitFor(() => {
      expect(mocks.inspectInvitation).toHaveBeenCalled();
    });

    fireEvent.click(await findEnabledButton(/^Send invitation$/i));

    await waitFor(() => {
      expect(mocks.sendInvitation).toHaveBeenCalledWith(
        'warmup_1',
        expect.any(AbortSignal),
      );
    });

    expect(mocks.notifications.success).not.toHaveBeenCalled();
    expect(mocks.notifications.warning).toHaveBeenCalledWith(
      'Invitation email could not be delivered',
    );
    expect(screen.getByText('Delivery failed')).toBeDefined();
    expect(
      screen.getByRole('button', { name: /Retry delivery/i }),
    ).toBeDefined();
  });

  it('keeps the previous invitation state when resend fails', async () => {
    mocks.resendInvitation.mockRejectedValueOnce(new Error('forbidden'));
    mocks.inspectInvitation.mockResolvedValue({
      ...account,
      invitation: { ...pendingInvitation, status: 'delivered' as const },
    });

    render(<WarmupAccountsPage defaultTab="accounts" />);

    await waitFor(() => {
      expect(screen.getByText('Delivered')).toBeDefined();
    });

    fireEvent.click(await findEnabledButton(/Resend invitation/i));

    await waitFor(() => {
      expect(mocks.resendInvitation).toHaveBeenCalledWith(
        'warmup_1',
        expect.any(AbortSignal),
      );
    });

    expect(mocks.notifications.error).toHaveBeenCalledWith(
      'Failed to resend invitation',
    );
    expect(mocks.notifications.success).not.toHaveBeenCalled();
    expect(screen.getByText('Delivered')).toBeDefined();
    expect(
      screen.getByRole('button', { name: /Resend invitation/i }),
    ).not.toHaveAttribute('disabled');
  });

  it('aborts an invitation action on unmount and ignores its stale result', async () => {
    const deliveredAccount = makeAccount({
      invitation: makeInvitation('delivered'),
    });
    const resend = createDeferred<IWarmupAccount>();
    let resendSignal: AbortSignal | undefined;
    mocks.getWarmupAccounts.mockResolvedValue([deliveredAccount]);
    mocks.inspectInvitation.mockResolvedValue(deliveredAccount);
    mocks.resendInvitation.mockImplementationOnce(
      (_accountId: string, signal: AbortSignal) => {
        resendSignal = signal;
        return resend.promise;
      },
    );

    const view = render(<WarmupAccountsPage defaultTab="accounts" />);
    fireEvent.click(await findEnabledButton(/Resend invitation/i));

    await waitFor(() => expect(resendSignal).toBeDefined());
    view.unmount();
    expect(resendSignal?.aborted).toBe(true);

    await act(async () => {
      resend.resolve(deliveredAccount);
      await resend.promise;
    });

    expect(mocks.notifications.success).not.toHaveBeenCalled();
    expect(mocks.notifications.warning).not.toHaveBeenCalled();
  });

  it('keeps a new account selection and its pending action isolated from a stale request', async () => {
    const firstAccount = makeAccount({
      invitation: makeInvitation('delivered'),
    });
    const secondInvitation = makeInvitation('delivered', {
      email: 'beta@example.com',
      id: 'invite_2',
      organizationId: 'org_2',
    });
    const secondAccount = makeAccount({
      brandId: 'brand_2',
      brandName: 'Beta',
      id: 'warmup_2',
      invitation: secondInvitation,
      invitationId: secondInvitation.id,
      leadEmail: secondInvitation.email,
      organizationId: secondInvitation.organizationId,
      organizationName: 'Beta Growth',
    });
    const staleResend = createDeferred<IWarmupAccount>();
    const secondInspection = createDeferred<IWarmupAccount>();
    let staleResendSignal: AbortSignal | undefined;

    mocks.getWarmupAccounts.mockResolvedValue([firstAccount, secondAccount]);
    mocks.inspectInvitation.mockImplementation((accountId: string) =>
      accountId === secondAccount.id
        ? secondInspection.promise
        : Promise.resolve(firstAccount),
    );
    mocks.resendInvitation.mockImplementationOnce(
      (_accountId: string, signal: AbortSignal) => {
        staleResendSignal = signal;
        return staleResend.promise;
      },
    );

    render(<WarmupAccountsPage defaultTab="accounts" />);
    fireEvent.click(await findEnabledButton(/Resend invitation/i));
    await waitFor(() => expect(staleResendSignal).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Beta Growth.*Beta/i }));
    await waitFor(() => {
      expect(mocks.inspectInvitation).toHaveBeenCalledWith(
        secondAccount.id,
        expect.any(AbortSignal),
      );
    });
    expect(staleResendSignal?.aborted).toBe(true);

    await act(async () => {
      staleResend.resolve(
        makeAccount({ invitation: makeInvitation('accepted') }),
      );
      await staleResend.promise;
    });

    expect(screen.getByRole('heading', { name: 'Beta' })).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Inspect invitation' }),
    ).toHaveAttribute('disabled');
    expect(mocks.notifications.success).not.toHaveBeenCalled();

    await act(async () => {
      secondInspection.resolve(secondAccount);
      await secondInspection.promise;
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Inspect invitation' }),
      ).not.toHaveAttribute('disabled');
    });
  });

  it('revokes an invitation after the server confirms the transition', async () => {
    render(<WarmupAccountsPage defaultTab="accounts" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Revoke invitation/i }),
      ).toBeDefined();
    });

    fireEvent.click(await findEnabledButton(/Revoke invitation/i));

    await waitFor(() => {
      expect(mocks.revokeInvitation).toHaveBeenCalledWith(
        'warmup_1',
        expect.any(AbortSignal),
      );
    });

    expect(mocks.notifications.success).toHaveBeenCalledWith(
      'Invitation revoked',
    );
    expect(screen.getByText('Revoked')).toBeDefined();
    expect(
      screen.queryByRole('button', { name: /Send invitation/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Revoke invitation/i }),
    ).toBeNull();
  });
});
