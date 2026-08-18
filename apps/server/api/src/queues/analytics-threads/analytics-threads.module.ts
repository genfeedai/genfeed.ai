import { PostsModule } from '@api/collections/posts/posts.module';
import { ThreadsModule } from '@api/services/integrations/threads/threads.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [PostsModule, ThreadsModule],
})
export class AnalyticsThreadsModule {}
