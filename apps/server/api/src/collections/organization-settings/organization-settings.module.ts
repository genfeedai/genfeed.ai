/**
 * Organization Settings Module
 * Organization-level settings: org preferences, default configurations,
branding settings, and feature flags.
 */

import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PublishingQuotaTierService } from '@api/collections/organization-settings/services/publishing-quota-tier.service';
import { CommonModule } from '@api/common/common.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [
    AssetGateService,
    OrganizationSettingsService,
    PublishingQuotaTierService,
  ],
  // CommonModule provides AccessBootstrapCacheService (used by AssetGateService).
  imports: [CommonModule],
  providers: [
    AssetGateService,
    OrganizationSettingsService,
    PublishingQuotaTierService,
  ],
})
export class OrganizationSettingsModule {}
