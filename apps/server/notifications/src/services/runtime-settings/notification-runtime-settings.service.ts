import { PlatformRuntimeSettingsClient } from '@libs/config/platform-runtime-settings.client';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
@Injectable()
export class NotificationRuntimeSettingsService extends PlatformRuntimeSettingsClient {
  constructor(config: ConfigService) {
    super(config);
  }
}
