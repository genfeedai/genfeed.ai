/**
 * Organization Settings Module
 * Organization-level settings: org preferences, default configurations,
branding settings, and feature flags.
 */

import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [OrganizationSettingsService],
  imports: [],
  providers: [OrganizationSettingsService],
})
export class OrganizationSettingsModule {}
