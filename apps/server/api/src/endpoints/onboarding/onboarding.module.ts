import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { LinksModule } from '@api/collections/links/links.module';
import { MembersModule } from '@api/collections/members/members.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { ProactiveOnboardingService } from '@api/endpoints/onboarding/proactive-onboarding.service';
import {
  Lead,
  LeadSchema,
} from '@api/endpoints/onboarding/schemas/lead.schema';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { ComfyUIModule } from '@api/services/integrations/comfyui/comfyui.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [OnboardingController],
  exports: [OnboardingService],
  imports: [
    BatchGenerationModule,
    BrandScraperModule,
    BrandsModule,
    ClerkModule,
    ComfyUIModule,
    CommonModule,
    CreditsModule,
    FilesClientModule,
    LinksModule,
    MembersModule,
    ModelsModule,
    MongooseModule.forFeature(
      [{ name: Lead.name, schema: LeadSchema }],
      DB_CONNECTIONS.CRM,
    ),
    OrganizationSettingsModule,
    OrganizationsModule,
    PostsModule,
    ReplicateModule,
    UsersModule,
  ],
  providers: [
    OnboardingService,
    MasterPromptGeneratorService,
    ProactiveOnboardingService,
  ],
})
export class OnboardingModule {}
