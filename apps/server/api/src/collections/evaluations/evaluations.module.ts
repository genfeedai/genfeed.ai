import { ArticlesModule } from '@api/collections/articles/articles.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { EvaluationsController } from '@api/collections/evaluations/controllers/evaluations.controller';
import {
  Evaluation,
  EvaluationSchema,
} from '@api/collections/evaluations/schemas/evaluation.schema';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ImagesModule } from '@api/collections/images/images.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

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

    MongooseModule.forFeatureAsync(
      [
        {
          name: Evaluation.name,
          useFactory: () => {
            const schema = EvaluationSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Compound indexes
            schema.index({ createdAt: -1, isDeleted: 1, organization: 1 });

            schema.index({ content: 1, contentType: 1, evaluationType: 1 });

            schema.index({ brand: 1, organization: 1, overallScore: -1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [EvaluationsService, EvaluationsOperationsService],
})
export class EvaluationsModule {}
