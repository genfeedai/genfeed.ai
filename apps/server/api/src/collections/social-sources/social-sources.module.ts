import { SocialSourcesController } from '@api/collections/social-sources/controllers/social-sources.controller';
import { SocialSourceHistoryImportWorkflowService } from '@api/collections/social-sources/services/social-source-history-import-workflow.service';
import { SocialSourceOwnAccountResyncWorkflowService } from '@api/collections/social-sources/services/social-source-own-account-resync-workflow.service';
import { SocialSourcesService } from '@api/collections/social-sources/services/social-sources.service';
import { SocialSourceHistoryImportModule } from '@api/collections/social-sources/social-source-history-import.module';
import { SourcePostsModule } from '@api/collections/source-posts/source-posts.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { SourceCollectorModule } from '@api/services/source-collector/source-collector.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SocialSourcesController],
  exports: [SocialSourcesService, SocialSourceOwnAccountResyncWorkflowService],
  imports: [
    SocialSourceHistoryImportModule,
    SourceCollectorModule,
    SourcePostsModule,
    WorkflowsCoreModule,
  ],
  providers: [
    SocialSourcesService,
    SocialSourceHistoryImportWorkflowService,
    SocialSourceOwnAccountResyncWorkflowService,
  ],
})
export class SocialSourcesModule {}
