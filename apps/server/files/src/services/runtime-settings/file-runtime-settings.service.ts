import { ConfigService } from '@files/config/config.service';
import { PlatformRuntimeSettingsClient } from '@libs/config/platform-runtime-settings.client';
import { Injectable } from '@nestjs/common';
@Injectable()
export class FileRuntimeSettingsService extends PlatformRuntimeSettingsClient {
  constructor(config: ConfigService) {
    super(config);
  }
}
