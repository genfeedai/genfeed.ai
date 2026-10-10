import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { RssSourcesController } from '@api/collections/rss-sources/controllers/rss-sources.controller';
import { RssSourceWorkflowService } from '@api/collections/rss-sources/services/rss-source-workflow.service';
import { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { OrganizationModuleAccessModule } from '@api/common/organization-modules/organization-module-access.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [RssSourcesController],
  exports: [RssSourcesService, RssSourceWorkflowService],
  imports: [PostGroupsModule, WorkflowsModule, OrganizationModuleAccessModule],
  providers: [RssSourcesService, RssSourceWorkflowService],
})
export class RssSourcesModule {}
