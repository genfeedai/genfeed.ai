import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WarmupAccountsPage from './warmup-accounts-page';

const mocks = vi.hoisted(() => ({
  createWarmupAccount: vi.fn(),
  getWarmupAccounts: vi.fn(),
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

vi.mock('@services/admin/warmup-accounts.service', () => ({
  AdminWarmupAccountsService: {
    getInstance: () => ({
      createWarmupAccount: mocks.createWarmupAccount,
      getWarmupAccounts: mocks.getWarmupAccounts,
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
    activeTab,
    children,
    label,
    onTabChange,
    tabs,
  }: {
    activeTab: string;
    children: ReactNode;
    label: string;
    onTabChange: (tab: string) => void;
    tabs: Array<{ id: string; label: string }>;
  }) => (
    <section>
      <h1>{label}</h1>
      <nav>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {children}
    </section>
  ),
}));

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
});
