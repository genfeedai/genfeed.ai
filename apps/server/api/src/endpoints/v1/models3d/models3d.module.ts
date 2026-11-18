import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { Models3dController } from '@api/endpoints/v1/models3d/models3d.controller';
import { Models3dService } from '@api/endpoints/v1/models3d/services/models3d.service';
import { Models3dBillingService } from '@api/endpoints/v1/models3d/services/models3d-billing.service';
import { Models3dBuildService } from '@api/endpoints/v1/models3d/services/models3d-build.service';
import { WebhooksCoreModule } from '@api/endpoints/webhooks/webhooks-core.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [Models3dController],
  imports: [
    ApiKeysModule,
    ConfigModule,
    CreditsModule,
    FilesClientModule,
    IngredientsModule,
    LoggerModule,
    MetadataModule,
    ModelsModule,
    QueuesModule,
    ReplicateModule,
    WebhooksCoreModule,
  ],
  providers: [Models3dBillingService, Models3dBuildService, Models3dService],
})
export class Models3dModule {}
