/**
 * Assets Module
 * General file management: upload/download files, S3 storage, metadata tracking,
folder organization, and asset tagging system.
 */

import { AssetsController } from '@api/collections/assets/controllers/assets.controller';
import { AssetsIngestionController } from '@api/collections/assets/controllers/operations/assets-ingestion.controller';
import { AssetsOperationsController } from '@api/collections/assets/controllers/operations/assets-operations.controller';
import { AssetIngestionService } from '@api/collections/assets/services/asset-ingestion.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    AssetsIngestionController,
    AssetsOperationsController,
    AssetsController,
  ],
  exports: [AssetsService],
  imports: [
    BrandsCoreModule,
    ByokModule,
    CreditsModule,
    FilesClientModule,
    IngredientsModule,
    MetadataModule,
    ModelsModule,

    NotificationsPublisherModule,
    PromptBuilderModule,
    ReplicateModule,
  ],
  providers: [
    AssetsService,
    AssetIngestionService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class AssetsModule {}
