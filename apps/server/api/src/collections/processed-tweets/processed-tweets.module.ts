/**
 * Processed Tweets Module
 * Tracks which tweets have been processed by the reply bot system
 * to prevent duplicate actions. Uses a TTL index to automatically
 * expire records after 7 days.
 */
import {
  ProcessedTweet,
  ProcessedTweetSchema,
} from '@api/collections/processed-tweets/schemas/processed-tweet.schema';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [],
  exports: [ProcessedTweetsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: ProcessedTweet.name,
          useFactory: () => {
            const schema = ProcessedTweetSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Note: Unique compound index is already defined in the schema file
            // TTL index is also defined in the schema via the `expires` property

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ProcessedTweetsService],
})
export class ProcessedTweetsModule {}
