import { PostsModule } from '@api/collections/posts/posts.module';
import { ThreadsModule } from '@api/services/integrations/threads/threads.module';
import { Module } from '@nestjs/common';
import { AnalyticsThreadsProcessor } from './analytics-threads.processor';

@Module({
  imports: [PostsModule, ThreadsModule],
  providers: [AnalyticsThreadsProcessor],
})
export class AnalyticsThreadsModule {}
