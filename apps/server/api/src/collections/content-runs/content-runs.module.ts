import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import {
  ContentRun,
  ContentRunSchema,
} from '@api/collections/content-runs/schemas/content-run.schema';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ContentRunsController],
  exports: [ContentRunsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: ContentRun.name,
          useFactory: () => {
            const schema = ContentRunSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { brand: 1, createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, skillSlug: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ContentRunsService],
})
export class ContentRunsModule {}
