import { ListeningTopicsController } from '@api/collections/listening-topics/controllers/listening-topics.controller';
import { ListeningTopicAnalysisService } from '@api/collections/listening-topics/services/listening-topic-analysis.service';
import { ListeningTopicAttributionService } from '@api/collections/listening-topics/services/listening-topic-attribution.service';
import { ListeningTopicCollectorService } from '@api/collections/listening-topics/services/listening-topic-collector.service';
import { ListeningTopicsService } from '@api/collections/listening-topics/services/listening-topics.service';
import { SourcePostsModule } from '@api/collections/source-posts/source-posts.module';
import { SourceCollectorModule } from '@api/services/source-collector/source-collector.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ListeningTopicsController],
  exports: [ListeningTopicAnalysisService, ListeningTopicsService],
  imports: [SourceCollectorModule, SourcePostsModule],
  providers: [
    ListeningTopicAnalysisService,
    ListeningTopicAttributionService,
    ListeningTopicCollectorService,
    ListeningTopicsService,
  ],
})
export class ListeningTopicsModule {}
