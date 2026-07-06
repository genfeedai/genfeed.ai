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
import { OnboardingCompletedListener } from '@api/endpoints/onboarding/listeners/onboarding-completed.listener';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { ProactiveOnboardingService } from '@api/endpoints/onboarding/proactive-onboarding.service';
import { OnboardingPreviewService } from '@api/endpoints/onboarding/services/onboarding-preview.service';
import { OnboardingReadinessService } from '@api/endpoints/onboarding/services/onboarding-readiness.service';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ComfyUIModule } from '@api/services/integrations/comfyui/comfyui.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [OnboardingController],
  exports: [OnboardingService],
  imports: [
    forwardRef(() => BatchGenerationModule),
    forwardRef(() => BrandScraperModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => ComfyUIModule),
    forwardRef(() => CommonModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => LinksModule),
    forwardRef(() => MembersModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RolesModule),
    forwardRef(() => UserSetupModule),
    forwardRef(() => UsersModule),
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
    OnboardingCompletedListener,
  ],
})
export class OnboardingModule {}
