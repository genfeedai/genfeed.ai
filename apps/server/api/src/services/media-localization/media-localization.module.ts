import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MediaLocalizationService } from '@api/services/media-localization/media-localization.service';
import { createServiceModule } from '@api/shared/service-module.factory';

export const MediaLocalizationModule = createServiceModule(
  MediaLocalizationService,
  {
    additionalImports: [
      IngredientsModule,
      MetadataModule,
      ByokModule,
      FilesClientModule,
      ElevenLabsModule,
      ReplicateModule,
    ],
  },
);
