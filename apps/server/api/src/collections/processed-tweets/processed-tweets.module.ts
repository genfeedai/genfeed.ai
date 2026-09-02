/**
 * Processed Tweets Module
 * Tracks which tweets have been processed by the reply bot system
 * to prevent duplicate actions. Uses a TTL index to automatically
 * expire records after 7 days.
 */
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [ProcessedTweetsService],
  imports: [],
  providers: [ProcessedTweetsService],
})
export class ProcessedTweetsModule {}
