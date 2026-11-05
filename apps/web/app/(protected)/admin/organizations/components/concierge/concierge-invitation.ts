import type {
  InvitationStatus,
  IWarmupAccount,
} from '@genfeedai/contracts/interfaces';

/** A concierge account the customer owns or an operator archived takes no more handoff steps. */
export function isConciergeClosed(account: IWarmupAccount): boolean {
  return account.status === 'CLAIMED' || account.status === 'ARCHIVED';
}

export function canSendInvitation(account: IWarmupAccount): boolean {
  if (!account.readiness?.ready || isConciergeClosed(account)) {
    return false;
  }

  if (account.invitation) {
    return false;
  }

  return (
    account.status === 'FAILED' ||
    account.status === 'INVITED' ||
    account.status === 'PROVISIONED'
  );
}

export function canResendInvitation(account: IWarmupAccount): boolean {
  const status = account.invitation?.status;
  if (!account.readiness?.ready || isConciergeClosed(account)) {
    return false;
  }
  return (
    status === 'pending' ||
    status === 'delivered' ||
    status === 'delivery-failed' ||
    status === 'expired'
  );
}

export function canRevokeInvitation(account: IWarmupAccount): boolean {
  const status = account.invitation?.status;
  return Boolean(status) && status !== 'accepted' && status !== 'revoked';
}

/** The i18n key (under `pages.warmupAccounts.invitation`) that names an invitation status. */
export function getInvitationStatusKey(
  status: InvitationStatus,
):
  | 'statusAccepted'
  | 'statusDelivered'
  | 'statusDeliveryFailed'
  | 'statusExpired'
  | 'statusPending'
  | 'statusRevoked' {
  switch (status) {
    case 'accepted':
      return 'statusAccepted';
    case 'delivered':
      return 'statusDelivered';
    case 'delivery-failed':
      return 'statusDeliveryFailed';
    case 'expired':
      return 'statusExpired';
    case 'revoked':
      return 'statusRevoked';
    default:
      return 'statusPending';
  }
}
