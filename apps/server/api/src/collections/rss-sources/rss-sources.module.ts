import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { RssSourcesController } from '@api/collections/rss-sources/controllers/rss-sources.controller';
import { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [RssSourcesController],
  exports: [RssSourcesService],
  imports: [PostGroupsModule],
  providers: [RssSourcesService],
})
export class RssSourcesModule {}
