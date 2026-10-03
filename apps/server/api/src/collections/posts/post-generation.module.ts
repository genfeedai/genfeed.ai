import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ContentLearningCoreModule } from '@api/collections/content-learning/content-learning-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { MembersModule } from '@api/collections/members/members.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { PostDraftGenerationService } from '@api/collections/posts/services/post-draft-generation.service';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { AgentChatModelRegistryModule } from '@api/services/agent-orchestrator/agent-chat-model-registry.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ContentLearningCoreModule,
    ActivitiesModule,
    ApiKeysModule,
    BrandsCoreModule,
    CredentialsCoreModule,
    MembersModule,
    PostsCoreModule,
    TemplatesModule,
    TrendsModule,
    AgentContextAssemblyModule,
    AgentChatModelRegistryModule,
    ReplicateModule,
    NotificationsPublisherModule,
    PromptBuilderModule,
    LoggerModule,
  ],
  providers: [
    PostDraftGenerationService,
    PostGenerationService,
    PostThreadGenerationService,
  ],
  exports: [PostGenerationService, PostThreadGenerationService],
})
export class PostGenerationModule {}
