import { ApiKeyHelperModule } from '@api/services/api-key/api-key-helper.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { createServiceModule } from '@api/shared/service-module.factory';

import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';

export const ElevenLabsModule = createServiceModule(ElevenLabsService, {
  additionalImports: [ApiKeyHelperModule, FilesClientModule],
});
