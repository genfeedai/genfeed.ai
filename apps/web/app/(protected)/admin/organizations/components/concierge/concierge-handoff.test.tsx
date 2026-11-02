import '@testing-library/jest-dom/vitest';
import type {
  IWarmupAccount,
  IWarmupInvitation,
  IWarmupInvitationStatus,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConciergeHandoff from './concierge-handoff';

const mocks = vi.hoisted(() => {
  const service = {
    getWarmupAccount: vi.fn(),
    inspectInvitation: vi.fn(),
    prepareWarmupAccount: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    sendInvitation: vi.fn(),
  };
  return {
    ...service,
    getService: async () => service,
    notifications: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const translators = new Map<
    string,
    ReturnType<typeof translateFromCatalog>
  >();
  return {
    useTranslations: (namespace: string) => {
      if (!translators.has(namespace)) {
        translators.set(namespace, translateFromCatalog(namespace));
      }
      return translators.get(namespace);
    },
  };
});

// Stable identity, like the real hook: a new function each render would reload the account.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
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

vi.mock('./concierge-preparation', () => ({
  default: () => <div>Preparation tools</div>,
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
        status: 'done',
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
  readiness: { availableCredits: 500, blockers: [], ready: true },
  status: 'INVITED',
  updatedAt: '2026-06-29T10:01:00.000Z',
};

function makeAccount(overrides: Partial<IWarmupAccount> = {}): IWarmupAccount {
  return { ...account, ...overrides };
}

function withInvitation(status: IWarmupInvitationStatus): IWarmupAccount {
  return makeAccount({ invitation: { ...pendingInvitation, status } });
}

const unsent = makeAccount({
  invitation: undefined,
  invitationId: undefined,
  status: 'PROVISIONED',
});

function load(loaded: IWarmupAccount, inspected: IWarmupAccount = loaded) {
  mocks.getWarmupAccount.mockResolvedValue(loaded);
  mocks.inspectInvitation.mockResolvedValue(inspected);
}

async function findEnabledButton(name: RegExp | string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('ConciergeHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    load(account);
  });

  it('shows a skeleton while the account loads, then the stage and the next step', async () => {
    render(<ConciergeHandoff conciergeId="warmup_1" />);

    expect(screen.getByTestId('concierge-handoff-loading')).toBeVisible();
    expect(await screen.findByText('Invited')).toBeVisible();
    expect(screen.getByText('Invitation status: Pending')).toBeVisible();
    expect(screen.getByText('lead@example.com')).toBeVisible();
    expect(screen.getByText('Preparation tools')).toBeVisible();
  });

  it('keeps ids and diagnostics closed until asked for', async () => {
    render(<ConciergeHandoff conciergeId="warmup_1" />);

    const trigger = await screen.findByRole('button', {
      name: 'IDs and diagnostics',
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('org_1')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(await screen.findByText('org_1')).toBeVisible();
    expect(
      screen.getByText('Created pending customer invitation.'),
    ).toBeVisible();
  });

  it('says the account could not load instead of showing an empty handoff', async () => {
    mocks.getWarmupAccount.mockRejectedValue(new Error('forbidden'));

    render(<ConciergeHandoff conciergeId="warmup_1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load the concierge account',
    );
    expect(screen.queryByText('Preparation tools')).not.toBeInTheDocument();
  });

  it('offers send, and no recovery action, when an eligible account has no invitation', async () => {
    load(unsent);

    render(<ConciergeHandoff conciergeId="warmup_1" ownerName="Ada" />);

    expect(await screen.findByText(/Ready to invite Ada\./)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Send invitation' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Resend invitation' }),
    ).not.toBeInTheDocument();
    expect(mocks.inspectInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', 'Pending', 'Resend invitation'],
    ['delivered', 'Delivered', 'Resend invitation'],
    ['delivery-failed', 'Delivery failed', 'Retry delivery'],
    ['expired', 'Expired', 'Resend invitation'],
  ] as const)(
    'offers only the recovery action for a %s invitation',
    async (status, statusLabel, actionLabel) => {
      load(withInvitation(status));

      render(<ConciergeHandoff conciergeId="warmup_1" />);

      expect(
        await screen.findByText(`Invitation status: ${statusLabel}`),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: actionLabel })).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Send invitation' }),
      ).not.toBeInTheDocument();
    },
  );

  it('lists what blocks the invitation, with a repair action', async () => {
    load(
      makeAccount({
        invitation: undefined,
        invitationId: undefined,
        readiness: {
          availableCredits: 0,
          blockers: ['Grant credits', 'Apply brand context'],
          ready: false,
        },
        status: 'PROVISIONED',
      }),
    );

    render(<ConciergeHandoff conciergeId="warmup_1" ownerName="Ada" />);

    expect(
      await screen.findByText('2 things left before you can invite Ada'),
    ).toBeVisible();
    expect(screen.getByText('Grant credits')).toBeVisible();
    expect(screen.getByText('Apply brand context')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Repair and refresh readiness' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Send invitation' }),
    ).not.toBeInTheDocument();
  });

  it('tells a claimed workspace apart: the customer owns it and no invitation step remains', async () => {
    load(makeAccount({ invitation: undefined, status: 'CLAIMED' }));

    render(<ConciergeHandoff conciergeId="warmup_1" />);

    expect(
      await screen.findByText(/Customer owns the workspace/),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /invitation/i }),
    ).not.toBeInTheDocument();
  });

  it('resends a pending invitation, tells the operator, and hands the fresh account to the list', async () => {
    const onAccountChange = vi.fn();
    const resent = withInvitation('delivered');
    mocks.resendInvitation.mockResolvedValue(resent);

    render(
      <ConciergeHandoff
        conciergeId="warmup_1"
        onAccountChange={onAccountChange}
      />,
    );
    fireEvent.click(await findEnabledButton('Resend invitation'));

    expect(
      await screen.findByText('Invitation status: Delivered'),
    ).toBeVisible();
    expect(mocks.notifications.success).toHaveBeenCalledWith(
      'Invitation resent',
    );
    expect(onAccountChange).toHaveBeenLastCalledWith(resent);
    expect(mocks.sendInvitation).not.toHaveBeenCalled();
  });

  it('does not report success when sending fails delivery, and offers a retry', async () => {
    load(unsent);
    mocks.sendInvitation.mockResolvedValue(withInvitation('delivery-failed'));

    render(<ConciergeHandoff conciergeId="warmup_1" />);
    fireEvent.click(await findEnabledButton('Send invitation'));

    expect(
      await screen.findByRole('button', { name: 'Retry delivery' }),
    ).toBeVisible();
    expect(mocks.notifications.warning).toHaveBeenCalledWith(
      'Invitation email could not be delivered',
    );
    expect(mocks.notifications.success).not.toHaveBeenCalled();
  });

  it('keeps the previous invitation state when resend fails', async () => {
    load(withInvitation('delivered'));
    mocks.resendInvitation.mockRejectedValue(new Error('forbidden'));

    render(<ConciergeHandoff conciergeId="warmup_1" />);
    fireEvent.click(await findEnabledButton('Resend invitation'));

    await waitFor(() =>
      expect(mocks.notifications.error).toHaveBeenCalledWith(
        'Failed to resend invitation',
      ),
    );
    expect(screen.getByText('Invitation status: Delivered')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Resend invitation' }),
    ).toBeEnabled();
  });

  it('revokes an open invitation', async () => {
    mocks.revokeInvitation.mockResolvedValue(withInvitation('revoked'));

    render(<ConciergeHandoff conciergeId="warmup_1" />);
    fireEvent.click(await findEnabledButton('Revoke invitation'));

    expect(await screen.findByText('Invitation status: Revoked')).toBeVisible();
    expect(mocks.notifications.success).toHaveBeenCalledWith(
      'Invitation revoked',
    );
  });
});
