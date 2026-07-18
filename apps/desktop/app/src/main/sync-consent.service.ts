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

const pendingConsent = (cloudUserId: string): IDesktopSyncConsent => ({
  allowFullAssetUploads: false,
  cloudUserId,
  status: 'pending',
});

export class DesktopSyncConsentService {
  constructor(private readonly database: DesktopKvService) {}

  getConsent(session: IDesktopSession | null): IDesktopSyncConsent {
    if (!session) {
      return {
        allowFullAssetUploads: false,
        status: 'not-required',
      };
    }

    const stored = this.database.getValueSync(
      `${SYNC_CONSENT_KEY_PREFIX}${session.userId}`,
    );

    if (!stored) {
      return pendingConsent(session.userId);
    }

    try {
      const consent = JSON.parse(stored) as IDesktopSyncConsent;
      if (
        consent.cloudUserId !== session.userId ||
        !['declined', 'granted'].includes(consent.status)
      ) {
        return pendingConsent(session.userId);
      }

      return {
        ...consent,
        allowFullAssetUploads:
          consent.status === 'granted' &&
          consent.allowFullAssetUploads === true,
      };
    } catch {
      return pendingConsent(session.userId);
    }
  }

  async setConsent(
    session: IDesktopSession | null,
    input: IDesktopSyncConsentInput,
  ): Promise<IDesktopSyncConsent> {
    if (!session) {
      throw new Error('Connect Genfeed Cloud before choosing sync settings.');
    }

    const consent: IDesktopSyncConsent = {
      allowFullAssetUploads:
        input.status === 'granted' && input.allowFullAssetUploads,
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
