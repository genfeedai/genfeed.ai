import { PostsModule } from '@api/collections/posts/posts.module';
import { ThreadsModule } from '@api/services/integrations/threads/threads.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  imports: [forwardRef(() => PostsModule), forwardRef(() => ThreadsModule)],
})
export class AnalyticsThreadsModule {}
