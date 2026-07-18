import type {
  DesktopSyncCursorScope,
  IDesktopSession,
  IDesktopSyncConsent,
  IDesktopSyncConsentInput,
} from '@genfeedai/desktop-contracts';
import type { DesktopKvService } from './kv.service';

const SYNC_CONSENT_KEY_PREFIX = 'desktop.sync.consent.';

export function getAccountScopedSyncCursorKey(
  cloudUserId: string,
  scope: DesktopSyncCursorScope = 'threads',
): string {
  return `sync.${scope}.${cloudUserId}.cursor`;
}

export function assertActiveSyncAccount(
  session: IDesktopSession | null,
  cloudUserId: string,
): IDesktopSession {
  if (!session || session.userId !== cloudUserId) {
    throw new Error(
      'The active Genfeed Cloud account changed. Restart sync and try again.',
    );
  }

  return session;
}

const pendingConsent = (cloudUserId: string): IDesktopSyncConsent => ({
  hasFullAssetUploadConsent: false,
  cloudUserId,
  status: 'pending',
});

function normalizeStoredConsent(
  stored: string,
  cloudUserId: string,
): IDesktopSyncConsent | null {
  try {
    const consent = JSON.parse(stored) as IDesktopSyncConsent;
    if (
      consent.cloudUserId !== cloudUserId ||
      !['declined', 'granted'].includes(consent.status)
    ) {
      return null;
    }

    return {
      ...consent,
      hasFullAssetUploadConsent:
        consent.status === 'granted' &&
        consent.hasFullAssetUploadConsent === true,
    };
  } catch {
    return null;
  }
}

export class DesktopSyncConsentService {
  constructor(private readonly database: DesktopKvService) {}

  getConsent(session: IDesktopSession | null): IDesktopSyncConsent {
    if (!session) {
      return {
        hasFullAssetUploadConsent: false,
        status: 'not-required',
      };
    }

    const stored = this.database.getValueSync(
      `${SYNC_CONSENT_KEY_PREFIX}${session.userId}`,
    );

    if (!stored) {
      return pendingConsent(session.userId);
    }

    return (
      normalizeStoredConsent(stored, session.userId) ??
      pendingConsent(session.userId)
    );
  }

  async setConsent(
    session: IDesktopSession | null,
    input: IDesktopSyncConsentInput,
  ): Promise<IDesktopSyncConsent> {
    if (!session) {
      throw new Error('Connect Genfeed Cloud before choosing sync settings.');
    }

    const consent: IDesktopSyncConsent = {
      hasFullAssetUploadConsent:
        input.status === 'granted' && input.hasFullAssetUploadConsent,
      cloudUserId: session.userId,
      decidedAt: new Date().toISOString(),
      status: input.status,
    };

    await this.database.setValue(
      `${SYNC_CONSENT_KEY_PREFIX}${session.userId}`,
      JSON.stringify(consent),
    );
    return consent;
  }
}
