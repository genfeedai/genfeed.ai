import { CREDENTIAL_PROFILE_SYNCED_EVENT } from '@api/collections/credentials/constants/credential-events.constants';
import type {
  CredentialDocument,
  CredentialProfileSyncedEvent,
  ExternalCredentialProfile,
} from '@api/collections/credentials/credential.types';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import type { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Hand a connected account's avatar and banner to brand asset autofill.
 *
 * The brands collection sits above the credentials leaf module, so it listens
 * rather than being called. `emit` does not await the listener, which keeps
 * the S3 upload off the OAuth callback. Credentials without a brand, owner, or
 * any profile media have nothing to offer and emit nothing.
 */
export function emitCredentialProfileSynced(
  eventEmitter: EventEmitter2,
  credential: CredentialDocument,
  profile: ExternalCredentialProfile,
): void {
  const avatarUrl = profile.avatarUrl ?? undefined;
  const bannerUrl = profile.bannerUrl ?? undefined;
  const { brandId, organizationId, platform, userId } = credential;

  if (!brandId || !organizationId || !userId || !(avatarUrl || bannerUrl)) {
    return;
  }

  const event: CredentialProfileSyncedEvent = {
    avatarUrl,
    bannerUrl,
    brandId,
    credentialId: credential.id,
    organizationId,
    platform: fromPrismaCredentialPlatform(platform) ?? String(platform),
    userId,
  };

  eventEmitter.emit(CREDENTIAL_PROFILE_SYNCED_EVENT, event);
}
