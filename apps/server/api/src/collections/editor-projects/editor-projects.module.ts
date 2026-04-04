import { EditorProjectsController } from '@api/collections/editor-projects/editor-projects.controller';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import {
  EditorProject,
  EditorProjectSchema,
} from '@api/collections/editor-projects/schemas/editor-project.schema';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { SharedModule } from '@api/shared/shared.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [EditorProjectsController],
  exports: [MongooseModule, EditorProjectsService],
  imports: [
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => FileQueueModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => SharedModule),
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: EditorProject.name,
          useFactory: () => {
            const schema = EditorProjectSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, organization: 1, updatedAt: -1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index({ status: 1, updatedAt: -1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [EditorProjectsService, EditorRenderService],
})
export class EditorProjectsModule {}
