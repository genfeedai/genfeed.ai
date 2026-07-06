/**
 * Brands Module
 * Brand management: Brand identity, styling, credentials integration, and content configuration.
 * Formerly known as Accounts module - migrated to Brands for clearer business terminology.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
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
import { VideosModule } from '@api/collections/videos/videos.module';
import { BrandCreditsGuard } from '@api/helpers/guards/brand-credits/brand-credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [BrandsController, BrandsRelationshipsController],
  // BrandDataMapper is exported so the onboarding preview pipeline (which still
  // lives in OnboardingModule and already imports BrandsModule) can reuse the
  // single canonical mapper without re-registering it.
  exports: [BrandsService, DefaultRecurringContentService, BrandDataMapper],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => ArticlesModule),
    forwardRef(() => BrandScraperModule),
    forwardRef(() => ByokModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => ImagesModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => LinksModule),
    forwardRef(() => LlmDispatcherModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => MusicsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => VideosModule),
  ],
  providers: [
    BrandsService,
    BrandCreditsGuard,
    CreditsInterceptor,
    DefaultRecurringContentService,
    // Brand-setup orchestration (scrape → analyze → guidance → slug sync),
    // dissolved out of OnboardingModule per REST audit #1354 so the brand write
    // routes no longer round-trip back through OnboardingService and close an
    // OnboardingModule ↔ BrandsModule import cycle.
    BrandSetupService,
    BrandPersistenceService,
    BrandDataMapper,
    MasterPromptGeneratorService,
  ],
})
export class BrandsModule {}
