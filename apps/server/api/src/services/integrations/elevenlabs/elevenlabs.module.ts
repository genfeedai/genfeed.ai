import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { ApiKeyHelperModule } from '@api/services/api-key/api-key-helper.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { createServiceModule } from '@api/shared/service-module.factory';

export const ElevenLabsModule = createServiceModule(ElevenLabsService, {
  additionalExports: [ElevenLabsConnectionService],
  additionalImports: [
    PlatformSettingsModule,
    ApiKeyHelperModule,
    ByokModule,
    FilesClientModule,
  ],
  additionalProviders: [ElevenLabsConnectionService],
});
