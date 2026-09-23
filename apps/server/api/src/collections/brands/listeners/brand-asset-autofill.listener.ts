import { BrandAssetAutofillService } from '@api/collections/brands/services/brand-asset-autofill.service';
import { CREDENTIAL_PROFILE_SYNCED_EVENT } from '@api/collections/credentials/constants/credential-events.constants';
import type { CredentialProfileSyncedEvent } from '@api/collections/credentials/credential.types';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Fills a brand's empty logo/banner from a social account as soon as the
 * account is connected or reconnected. The service never throws.
 */
@Injectable()
export class BrandAssetAutofillListener {
  constructor(private readonly autofillService: BrandAssetAutofillService) {}

  @OnEvent(CREDENTIAL_PROFILE_SYNCED_EVENT)
  async handleProfileSynced(
    event: CredentialProfileSyncedEvent,
  ): Promise<void> {
    await this.autofillService.fillFromSocialProfile(
      {
        brandId: event.brandId,
        organizationId: event.organizationId,
        userId: event.userId,
      },
      {
        avatarUrl: event.avatarUrl,
        bannerUrl: event.bannerUrl,
        platform: event.platform,
      },
    );
  }
}
