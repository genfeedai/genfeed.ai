import type {
  AccountHealthSummary,
  ICredential,
} from '@genfeedai/contracts/interfaces';

const LEADING_AT_SIGN_PATTERN = /^@/;

export type ConnectedAccountSource = Pick<
  ICredential,
  'externalAvatar' | 'externalHandle' | 'externalName' | 'label' | 'platform'
>;

/** What a surface needs to render a connected account, from a credential. */
export interface ConnectedAccountFields {
  platform: string;
  avatarUrl: string | null;
  name: string | null;
  handle: string | null;
}

/** `@handle` for a provider handle, or null when the account has none. */
export function formatAccountHandle(
  handle: string | null | undefined,
): string | null {
  const bare = handle?.trim().replace(LEADING_AT_SIGN_PATTERN, '');
  return bare ? `@${bare}` : null;
}

/** Maps an account-health summary onto the one shape every account display takes. */
export function accountHealthToConnectedAccount(
  account: AccountHealthSummary,
): ConnectedAccountFields {
  return {
    avatarUrl: account.avatarUrl ?? null,
    handle: account.handle ?? null,
    name: account.label,
    platform: account.platform,
  };
}

/** Maps a credential onto the one shape every account display takes. */
export function toConnectedAccount(
  credential: ConnectedAccountSource,
): ConnectedAccountFields {
  return {
    avatarUrl: credential.externalAvatar?.trim() || null,
    handle: credential.externalHandle ?? null,
    name: credential.label || credential.externalName || null,
    platform: credential.platform,
  };
}
