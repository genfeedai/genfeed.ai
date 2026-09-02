import { ArticlesModule } from '@api/collections/articles/articles.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { EvaluationsController } from '@api/collections/evaluations/controllers/evaluations.controller';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ImagesCoreModule } from '@api/collections/images/images-core.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { VideosCoreModule } from '@api/collections/videos/videos-core.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [EvaluationsController],
  exports: [EvaluationsService, EvaluationsOperationsService],
  imports: [
    ArticlesModule,
    ConfigModule,
    CreditsModule,
    ImagesCoreModule,
    ModelsModule,
    NotificationsPublisherModule,
    PostsCoreModule,
    PromptBuilderModule,
    ReplicateModule,
    VideosCoreModule,
  ],
  providers: [EvaluationsService, EvaluationsOperationsService],
})
export class EvaluationsModule {}
