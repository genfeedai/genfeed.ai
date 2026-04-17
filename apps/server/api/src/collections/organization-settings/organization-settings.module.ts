/**
 * Organization Settings Module
 * Organization-level settings: org preferences, default configurations,
branding settings, and feature flags.
 */

import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [OrganizationSettingsService],
  imports: [forwardRef(() => ModelsModule)],
  providers: [OrganizationSettingsService],
})
export class OrganizationSettingsModule {}
