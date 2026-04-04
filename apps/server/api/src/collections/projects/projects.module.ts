import { ProjectsController } from '@api/collections/projects/controllers/projects.controller';
import {
  Project,
  ProjectSchema,
} from '@api/collections/projects/schemas/project.schema';
import { ProjectsService } from '@api/collections/projects/services/projects.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ProjectsController],
  exports: [ProjectsService, MongooseModule],
  imports: [
    LoggerModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Project.name,
          useFactory: () => {
            const schema = ProjectSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, organization: 1, updatedAt: -1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            schema.index({ isDeleted: 1, organization: 1, status: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ProjectsService],
})
export class ProjectsModule {}
