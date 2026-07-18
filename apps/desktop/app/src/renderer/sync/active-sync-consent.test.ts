import type {
  IDesktopSession,
  IDesktopSyncConsent,
} from '@genfeedai/desktop-contracts';
import { describe, expect, it } from 'vitest';
import { hasActiveAccountSyncConsent } from './active-sync-consent';

const session: IDesktopSession = {
  issuedAt: '2026-07-18T00:00:00.000Z',
  token: 'test-token',
  userId: 'cloud-user-a',
};

const grantedConsent: IDesktopSyncConsent = {
  cloudUserId: session.userId,
  hasFullAssetUploadConsent: false,
  status: 'granted',
};

describe('hasActiveAccountSyncConsent', () => {
  it('allows sync only for granted consent owned by the active account', () => {
    expect(hasActiveAccountSyncConsent(session, grantedConsent)).toBe(true);
  });

  it('rejects consent from another account', () => {
    expect(
      hasActiveAccountSyncConsent(session, {
        ...grantedConsent,
        cloudUserId: 'cloud-user-b',
      }),
    ).toBe(false);
  });

  it('rejects granted consent without an active session', () => {
    expect(hasActiveAccountSyncConsent(null, grantedConsent)).toBe(false);
  });
});
