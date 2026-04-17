import { ArticlesModule } from '@api/collections/articles/articles.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { EvaluationsController } from '@api/collections/evaluations/controllers/evaluations.controller';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ImagesModule } from '@api/collections/images/images.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { ConfigModule } from '@api/config/config.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [EvaluationsController],
  exports: [EvaluationsService, EvaluationsOperationsService],
  imports: [
    forwardRef(() => ArticlesModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ImagesModule),
    forwardRef(() => ModelsModule),
    NotificationsPublisherModule,
    forwardRef(() => PostsModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => VideosModule),
  ],
  providers: [EvaluationsService, EvaluationsOperationsService],
})
export class EvaluationsModule {}
