import { ApiKeyHelperModule } from '@api/services/api-key/api-key-helper.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { forwardRef } from '@nestjs/common';

export const ElevenLabsModule = createServiceModule(ElevenLabsService, {
  additionalImports: [
    forwardRef(() => ApiKeyHelperModule),
    forwardRef(() => FilesClientModule),
  ],
});
