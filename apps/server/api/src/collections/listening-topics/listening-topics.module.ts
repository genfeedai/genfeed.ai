import { ListeningTopicsController } from '@api/collections/listening-topics/controllers/listening-topics.controller';
import { ListeningTopicCollectorService } from '@api/collections/listening-topics/services/listening-topic-collector.service';
import { ListeningTopicsService } from '@api/collections/listening-topics/services/listening-topics.service';
import { SourcePostsModule } from '@api/collections/source-posts/source-posts.module';
import { SourceCollectorModule } from '@api/services/source-collector/source-collector.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ListeningTopicsController],
  exports: [ListeningTopicsService],
  imports: [SourceCollectorModule, SourcePostsModule],
  providers: [ListeningTopicCollectorService, ListeningTopicsService],
})
export class ListeningTopicsModule {}
