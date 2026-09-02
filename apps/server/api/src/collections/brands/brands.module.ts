/**
 * Brands Module
 * Brand management: Brand identity, styling, credentials integration, and content configuration.
 * Formerly known as Accounts module - migrated to Brands for clearer business terminology.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import { BrandsSetupController } from '@api/collections/brands/controllers/brands-setup.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { BrandWebsitePreviewService } from '@api/collections/brands/services/brand-website-preview.service';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { LinksModule } from '@api/collections/links/links.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { CommonModule } from '@api/common/common.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    BrandsAgentConfigController,
    BrandsSetupController,
    BrandsController,
    BrandsRelationshipsController,
  ],
  // BrandDataMapper is exported so the onboarding preview pipeline (which still
  // lives in OnboardingModule and already imports BrandsModule) can reuse the
  // single canonical mapper without re-registering it.
  // BrandPersistenceService + MasterPromptGeneratorService are exported so the
  // signup-prefill worker composes the same scrape → analyze → persist
  // primitives as interactive brand setup instead of duplicating the graph.
  exports: [
    BrandsCoreModule,
    BrandPersistenceService,
    MasterPromptGeneratorService,
  ],
  imports: [
    BrandsCoreModule,
    CommonModule,
    ActivitiesModule,
    ArticlesModule,
    ByokModule,
    CredentialsCoreModule,
    CreditsModule,
    ImagesModule,
    IngredientsModule,
    LinksModule,
    ModelsModule,
    MusicsModule,
    OrganizationSettingsModule,
    OrganizationsModule,
    PostsModule,
    ReplicateModule,
    SkillsModule,
    VideosModule,
  ],
  providers: [
    // Brand-setup orchestration (scrape → analyze → guidance → slug sync),
    // dissolved out of OnboardingModule per REST audit #1354 so the brand write
    // routes no longer round-trip back through OnboardingService and close an
    // OnboardingModule ↔ BrandsModule import cycle.
    BrandSetupService,
    BrandWebsitePreviewService,
    BrandPersistenceService,
    MasterPromptGeneratorService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class BrandsModule {}
