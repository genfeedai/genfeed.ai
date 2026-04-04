import { ContentDraftsController } from '@api/collections/content-drafts/controllers/content-drafts.controller';
import {
  ContentDraft,
  ContentDraftSchema,
} from '@api/collections/content-drafts/schemas/content-draft.schema';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ContentDraftsController],
  exports: [ContentDraftsService],
  imports: [
    TrendsModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: ContentDraft.name,
          useFactory: () => {
            const schema = ContentDraftSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { brand: 1, createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, organization: 1, skillSlug: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ContentDraftsService],
})
export class ContentDraftsModule {}
