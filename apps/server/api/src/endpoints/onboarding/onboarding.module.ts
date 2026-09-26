import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { LinksModule } from '@api/collections/links/links.module';
import { MembersModule } from '@api/collections/members/members.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { ProactiveOnboardingService } from '@api/endpoints/onboarding/proactive-onboarding.service';
import { OnboardingPreviewService } from '@api/endpoints/onboarding/services/onboarding-preview.service';
import { OnboardingReadinessService } from '@api/endpoints/onboarding/services/onboarding-readiness.service';
import { OnboardingStarterAssetsService } from '@api/endpoints/onboarding/services/onboarding-starter-assets.service';
import { OnboardingStarterAssetsQueueService } from '@api/endpoints/onboarding/services/onboarding-starter-assets-queue.service';
import { AgentGenerationGatewayModule } from '@api/services/agent-generation-gateway/agent-generation-gateway.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ComfyUIModule } from '@api/services/integrations/comfyui/comfyui.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { ONBOARDING_STARTER_ASSETS_QUEUE } from '@genfeedai/contracts/queue';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  controllers: [OnboardingController],
  // OnboardingStarterAssetsService is exported so the workers app (which
  // imports this module for the BullMQ processor) can run the same
  // generation logic the queue producer enqueues — see
  // `OnboardingStarterAssetsProcessor`.
  exports: [OnboardingService, OnboardingStarterAssetsService],
  imports: [
    AgentGenerationGatewayModule,
    BatchGenerationModule,
    BrandScraperModule,
    BrandsModule,
    ComfyUIModule,
    CommonModule,
    CreditsModule,
    FilesClientModule,
    LinksModule,
    LlmDispatcherModule,
    MembersModule,
    ModelsModule,
    OrganizationSettingsModule,
    OrganizationsModule,
    PostsModule,
    ReplicateModule,
    RolesModule,
    UserSetupModule,
    UsersModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
      name: ONBOARDING_STARTER_ASSETS_QUEUE,
    }),
  ],
  providers: [
    OnboardingService,
    MasterPromptGeneratorService,
    ProactiveOnboardingService,
    // BrandDataMapper is consumed from BrandsModule's exports (single canonical
    // mapper); BrandPersistenceService + the brand-setup orchestration moved to
    // BrandsModule per REST audit #1354 to break the module import cycle.
    OnboardingPreviewService,
    OnboardingReadinessService,
    OnboardingStarterAssetsQueueService,
    OnboardingStarterAssetsService,
  ],
})
export class OnboardingModule {}
