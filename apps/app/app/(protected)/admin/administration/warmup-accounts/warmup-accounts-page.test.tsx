import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WarmupAccountsPage from './warmup-accounts-page';

const mocks = vi.hoisted(() => ({
  createWarmupAccount: vi.fn(),
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
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('test-token'),
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

const pendingInvitation = {
  createdAt: '2026-06-29T10:01:00.000Z',
  email: 'lead@example.com',
  expiresAt: '2026-07-06T10:01:00.000Z',
  id: 'invite_1',
  invitedByUserId: 'operator_1',
  organizationId: 'org_1',
  status: 'pending' as const,
  updatedAt: '2026-06-29T10:01:00.000Z',
};

const account = {
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

describe('WarmupAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('inspects invitation state and exposes send and revoke for pending invitations', async () => {
    render(<WarmupAccountsPage defaultTab="accounts" />);

    await waitFor(() => {
      expect(mocks.inspectInvitation).toHaveBeenCalledWith('warmup_1');
    });

    expect(screen.getByText('Pending')).toBeDefined();
    expect(
      screen.getByRole('button', { name: /^Send invitation$/i }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: /^Revoke invitation$/i }),
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: /^Resend invitation$/i }),
    ).toBeNull();
  });

  it('sends an invitation from server state and does not mark success when dispatch fails', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /^Send invitation$/i }));

    await waitFor(() => {
      expect(mocks.sendInvitation).toHaveBeenCalledWith('warmup_1');
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

    fireEvent.click(screen.getByRole('button', { name: /Resend invitation/i }));

    await waitFor(() => {
      expect(mocks.resendInvitation).toHaveBeenCalledWith('warmup_1');
    });

    expect(mocks.notifications.error).toHaveBeenCalledWith(
      'Failed to resend invitation',
    );
    expect(mocks.notifications.success).not.toHaveBeenCalled();
    expect(screen.getByText('Delivered')).toBeDefined();
  });

  it('revokes an invitation after the server confirms the transition', async () => {
    render(<WarmupAccountsPage defaultTab="accounts" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Revoke invitation/i }),
      ).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Revoke invitation/i }));

    await waitFor(() => {
      expect(mocks.revokeInvitation).toHaveBeenCalledWith('warmup_1');
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
