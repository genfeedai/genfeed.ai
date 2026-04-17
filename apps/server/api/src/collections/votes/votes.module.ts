/**
 * Votes Module
 * Voting & rating system: content ratings, user votes, vote aggregation,
and popularity tracking.
 */

import { VotesController } from '@api/collections/votes/controllers/votes.controller';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [VotesController],
  exports: [VotesService],
  imports: [],
  providers: [VotesService],
})
export class VotesModule {}
