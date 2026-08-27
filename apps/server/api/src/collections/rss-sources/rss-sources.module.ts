import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { RssSourcesController } from '@api/collections/rss-sources/controllers/rss-sources.controller';
import { Module } from '@nestjs/common';
import { RssSourcesService } from '@server/collections/rss-sources/services/rss-sources.service';

@Module({
  controllers: [RssSourcesController],
  exports: [RssSourcesService],
  imports: [PostGroupsModule],
  providers: [RssSourcesService],
})
export class RssSourcesModule {}
