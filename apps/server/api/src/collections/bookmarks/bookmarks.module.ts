import { BookmarksController } from '@api/collections/bookmarks/controllers/bookmarks.controller';
import {
  Bookmark,
  BookmarkSchema,
} from '@api/collections/bookmarks/schemas/bookmark.schema';
import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [BookmarksController],
  exports: [BookmarksService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: Bookmark.name,
          useFactory: () => {
            const schema = BookmarkSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Primary query patterns with soft delete support
            schema.index(
              { isDeleted: 1, organization: 1, savedAt: -1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // User-scoped queries
            schema.index({ savedAt: -1, user: 1 });

            // Filter by type/platform
            schema.index({ organization: 1, platform: 1, type: 1 });

            // Filter by intent
            schema.index({ intent: 1, organization: 1 });

            // Folder organization
            schema.index(
              { folder: 1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false }, sparse: true },
            );

            // Tag filtering
            schema.index({ organization: 1, tags: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [BookmarksService],
})
export class BookmarksModule {}
