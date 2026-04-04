import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { CrmModule } from '@api/endpoints/admin/crm/crm.module';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { ComfyUIModule } from '@api/services/integrations/comfyui/comfyui.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [OnboardingController],
  exports: [OnboardingService],
  imports: [
    BrandScraperModule,
    BrandsModule,
    ClerkModule,
    ComfyUIModule,
    CommonModule,
    CrmModule,
    CreditsModule,
    FilesClientModule,
    ModelsModule,
    OrganizationSettingsModule,
    OrganizationsModule,
    ReplicateModule,
    UsersModule,
  ],
  providers: [OnboardingService, MasterPromptGeneratorService],
})
export class OnboardingModule {}
