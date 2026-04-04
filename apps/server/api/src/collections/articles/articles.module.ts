/**
 * Articles Module
 * SEO-optimized long-form content: AI generation, conversational editing, version control,
Twitter thread conversion, virality analysis, and public link sharing.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import {
  Article,
  ArticleSchema,
} from '@api/collections/articles/schemas/article.schema';
import {
  ArticleAnalytics,
  ArticleAnalyticsSchema,
} from '@api/collections/articles/schemas/article-analytics.schema';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ArticlesAnalyticsService } from '@api/collections/articles/services/articles-analytics.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { RouterModule } from '@api/services/router/router.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ArticlesController],
  exports: [
    ArticleAnalyticsService,
    ArticlesAnalyticsService,
    ArticlesContentService,
    ArticlesService,
    MongooseModule,
  ],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => BrandsModule),
    ByokModule,
    forwardRef(() => ConfigModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RouterModule),
    forwardRef(() => TemplatesModule),
    forwardRef(() => UsersModule),

    // Article schema on default (cloud) connection
    MongooseModule.forFeatureAsync(
      [
        {
          name: Article.name,
          useFactory: () => {
            const schema = ArticleSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // User-scoped queries
            schema.index(
              { createdAt: -1, isDeleted: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Brand-scoped queries
            schema.index(
              { brand: 1, createdAt: -1, isDeleted: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Create indexes for better performance
            schema.index({ brand: 1, organization: 1, user: 1 });
            schema.index(
              { publishedAt: -1, scope: 1, status: 1 },
              { sparse: true },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
    // ArticleAnalytics schema on analytics connection
    MongooseModule.forFeatureAsync(
      [
        {
          name: ArticleAnalytics.name,
          useFactory: () => {
            const schema = ArticleAnalyticsSchema;
            schema.plugin(mongooseAggregatePaginateV2);
            return schema;
          },
        },
      ],
      DB_CONNECTIONS.ANALYTICS,
    ),
  ],
  providers: [
    ArticleAnalyticsService,
    ArticlesAnalyticsService,
    ArticlesContentService,
    ArticlesService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class ArticlesModule {}
