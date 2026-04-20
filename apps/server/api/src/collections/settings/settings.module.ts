/**
 * Settings Module
 * User settings: preferences, notifications, theme settings,
and personalization options.
 */

import { SettingsService } from '@api/collections/settings/services/settings.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [SettingsService],
  imports: [],
  providers: [SettingsService],
})
export class SettingsModule {}
