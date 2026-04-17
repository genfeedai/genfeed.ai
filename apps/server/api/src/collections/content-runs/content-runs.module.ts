import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ContentRunsController],
  exports: [ContentRunsService],
  imports: [],
  providers: [ContentRunsService],
})
export class ContentRunsModule {}
