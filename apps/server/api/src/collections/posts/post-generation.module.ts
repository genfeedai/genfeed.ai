import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ContentLearningCoreModule } from '@api/collections/content-learning/content-learning-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { MembersModule } from '@api/collections/members/members.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { PostAccountGenerationService } from '@api/collections/posts/services/post-account-generation.service';
import { PostAccountGenerationBillingService } from '@api/collections/posts/services/post-account-generation-billing.service';
import { PostAccountGenerationQueueService } from '@api/collections/posts/services/post-account-generation-queue.service';
import { PostAccountGenerationRunnerService } from '@api/collections/posts/services/post-account-generation-runner.service';
import { PostAccountLearningService } from '@api/collections/posts/services/post-account-learning.service';
import { PostDraftGenerationService } from '@api/collections/posts/services/post-draft-generation.service';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { AgentChatModelRegistryModule } from '@api/services/agent-orchestrator/agent-chat-model-registry.module';
import { BrandedTextGenerationModule } from '@api/services/branded-text-generation/branded-text-generation.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { SourceCollectorModule } from '@api/services/source-collector/source-collector.module';
import { ACCOUNT_GENERATION_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    BullModule.registerQueue({ name: ACCOUNT_GENERATION_QUEUE }),
    ContentLearningCoreModule,
    ActivitiesModule,
    ApiKeysModule,
    BrandsCoreModule,
    CredentialsCoreModule,
    CreditsModule,
    MembersModule,
    ModelsModule,
    PostsCoreModule,
    TemplatesModule,
    TrendsModule,
    AgentContextAssemblyModule,
    AgentChatModelRegistryModule,
    BrandedTextGenerationModule,
    ByokModule,
    ReplicateModule,
    NotificationsPublisherModule,
    PromptBuilderModule,
    SourceCollectorModule,
    LoggerModule,
  ],
  providers: [
    PostAccountGenerationQueueService,
    PostAccountGenerationRunnerService,
    PostAccountGenerationBillingService,
    PostAccountGenerationService,
    PostAccountLearningService,
    PostDraftGenerationService,
    PostGenerationService,
    PostThreadGenerationService,
  ],
  exports: [
    PostGenerationService,
    PostThreadGenerationService,
    PostAccountGenerationRunnerService,
  ],
})
export class PostGenerationModule {}
