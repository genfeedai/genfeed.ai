import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { RssSourcesController } from '@api/collections/rss-sources/controllers/rss-sources.controller';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { Module } from '@nestjs/common';
import { RssSourceWorkflowService } from '@server/collections/rss-sources/services/rss-source-workflow.service';
import { RssSourcesService } from '@server/collections/rss-sources/services/rss-sources.service';

@Module({
  controllers: [RssSourcesController],
  exports: [RssSourcesService, RssSourceWorkflowService],
  imports: [PostGroupsModule, WorkflowsModule],
  providers: [RssSourcesService, RssSourceWorkflowService],
})
export class RssSourcesModule {}
