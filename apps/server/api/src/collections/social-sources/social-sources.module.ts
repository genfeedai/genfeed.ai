import { SocialSourcesController } from '@api/collections/social-sources/controllers/social-sources.controller';
import { SocialSourcesService } from '@api/collections/social-sources/services/social-sources.service';
import { SourcePostsModule } from '@api/collections/source-posts/source-posts.module';
import { SourceCollectorModule } from '@api/services/source-collector/source-collector.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SocialSourcesController],
  exports: [SocialSourcesService],
  imports: [SourceCollectorModule, SourcePostsModule],
  providers: [SocialSourcesService],
})
export class SocialSourcesModule {}
