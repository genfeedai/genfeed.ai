import { ClipResultsController } from '@api/collections/clip-results/clip-results.controller';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ClipResultsController],
  exports: [ClipResultsService],
  imports: [],
  providers: [ClipResultsService],
})
export class ClipResultsModule {}
