/**
 * Votes Module
 * Voting & rating system: content ratings, user votes, vote aggregation,
and popularity tracking.
 */

import { VotesController } from '@api/collections/votes/controllers/votes.controller';
import { Vote, VoteSchema } from '@api/collections/votes/schemas/vote.schema';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [VotesController],
  exports: [MongooseModule, VotesService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Vote.name,
          useFactory: () => {
            const schema = VoteSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // User-scoped queries
            schema.index(
              { createdAt: -1, isDeleted: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // User-specific vote queries (existing unique index)
            schema.index(
              {
                entity: 1,
                entityModel: 1,
                isDeleted: 1,
                user: 1,
              },
              { unique: true },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [VotesService],
})
export class VotesModule {}
