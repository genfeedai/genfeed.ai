/**
 * Trainings Module
 * Custom model training: upload training data, fine-tune models,
track training jobs, and model versioning.
 */
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { TrainingsOperationsController } from '@api/collections/trainings/controllers/operations/trainings-operations.controller';
import { TrainingsController } from '@api/collections/trainings/controllers/trainings.controller';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { MemoryModule } from '@api/helpers/memory/memory.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [TrainingsController, TrainingsOperationsController],
  exports: [TrainingsService],
  imports: [
    ByokModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => FileQueueModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => ModelsModule),

    FilesClientModule,
    MemoryModule,
    NotificationsPublisherModule,
    ReplicateModule,
  ],
  providers: [TrainingsService, CreditsGuard, CreditsInterceptor],
})
export class TrainingsModule {}
