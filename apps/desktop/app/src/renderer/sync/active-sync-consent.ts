import type {
  IDesktopSession,
  IDesktopSyncConsent,
} from '@genfeedai/desktop-contracts';

export function hasActiveAccountSyncConsent(
  session: IDesktopSession | null,
  consent: IDesktopSyncConsent,
): boolean {
  return (
    session !== null &&
    consent.status === 'granted' &&
    consent.cloudUserId === session.userId
  );
}
