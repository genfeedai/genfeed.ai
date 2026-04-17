/**
 * Brands Module
 * Brand management: Brand identity, styling, credentials integration, and content configuration.
 * Formerly known as Accounts module - migrated to Brands for clearer business terminology.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { LinksModule } from '@api/collections/links/links.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { BrandCreditsGuard } from '@api/helpers/guards/brand-credits/brand-credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [BrandsController, BrandsRelationshipsController],
  exports: [BrandsService],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => ArticlesModule),
    BrandScraperModule,
    ByokModule,
    forwardRef(() => CredentialsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ImagesModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => LinksModule),
    LlmDispatcherModule,
    forwardRef(() => ModelsModule),
    forwardRef(() => MusicsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => VideosModule),
    forwardRef(() => WorkflowsModule),
  ],
  providers: [
    BrandsService,
    BrandCreditsGuard,
    CreditsInterceptor,
    DefaultRecurringContentService,
  ],
})
export class BrandsModule {}
