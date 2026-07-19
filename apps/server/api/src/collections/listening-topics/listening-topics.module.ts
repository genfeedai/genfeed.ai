import { ListeningTopicsController } from '@api/collections/listening-topics/controllers/listening-topics.controller';
import { ListeningTopicsService } from '@api/collections/listening-topics/services/listening-topics.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ListeningTopicsController],
  exports: [ListeningTopicsService],
  providers: [ListeningTopicsService],
})
export class ListeningTopicsModule {}
