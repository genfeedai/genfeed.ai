import { ClipperResultsController } from '@api/collections/clipper-results/clipper-results.controller';
import { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ClipperResultsController],
  exports: [ClipperResultsService],
  imports: [],
  providers: [ClipperResultsService],
})
export class ClipperResultsModule {}
