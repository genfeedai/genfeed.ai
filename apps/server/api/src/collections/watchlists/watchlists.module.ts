import { WatchlistsController } from '@api/collections/watchlists/controllers/watchlists.controller';
import {
  Watchlist,
  WatchlistSchema,
} from '@api/collections/watchlists/schemas/watchlist.schema';
import { WatchlistsService } from '@api/collections/watchlists/services/watchlists.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [WatchlistsController],
  exports: [WatchlistsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: Watchlist.name,
          useFactory: () => {
            const schema = WatchlistSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Compound index with soft-delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Unique index to prevent duplicate entries
            schema.index(
              { brand: 1, handle: 1, platform: 1 },
              { unique: true },
            );

            // Platform-specific queries
            schema.index(
              { isDeleted: 1, organization: 1, platform: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            // Index for filtering by platform
            schema.index({ platform: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [WatchlistsService],
})
export class WatchlistsModule {}
