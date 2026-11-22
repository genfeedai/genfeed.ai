import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { KlingAIService } from '@api/services/integrations/klingai/services/klingai.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';

export const KlingAIModule = createServiceModule(KlingAIService, {
  additionalImports: [
    PlatformSettingsModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
  ],
});
