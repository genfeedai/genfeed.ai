/**
 * Brands Module
 * Brand management: Brand identity, styling, credentials integration, and content configuration.
 * Formerly known as Accounts module - migrated to Brands for clearer business terminology.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import {
  Brand,
  BrandSchema,
} from '@api/collections/brands/schemas/brand.schema';
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
import {
  WorkflowExecution,
  WorkflowExecutionSchema,
} from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BrandCreditsGuard } from '@api/helpers/guards/brand-credits/brand-credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [BrandsController, BrandsRelationshipsController],
  exports: [MongooseModule, BrandsService],
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
    MongooseModule.forFeature(
      [{ name: WorkflowExecution.name, schema: WorkflowExecutionSchema }],
      DB_CONNECTIONS.CLOUD,
    ),

    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Brand.name,
          useFactory: () => {
            const schema = BrandSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.virtual('logo', {
              foreignField: 'parent',
              justOne: true,
              localField: '_id',
              match: {
                category: AssetCategory.LOGO,
                isDeleted: false,
                parentModel: AssetParent.BRAND,
              },
              ref: 'Asset',
              select: '_id',
            });

            schema.virtual('banner', {
              foreignField: 'parent',
              justOne: true,
              localField: '_id',
              match: {
                category: AssetCategory.BANNER,
                isDeleted: false,
                parentModel: AssetParent.BRAND,
              },
              ref: 'Asset',
            });

            schema.virtual('references', {
              foreignField: 'parent',
              localField: '_id',
              match: {
                category: AssetCategory.REFERENCE,
                isDeleted: false,
                parentModel: AssetParent.BRAND,
              },
              ref: 'Asset',
            });

            schema.virtual('credentials', {
              foreignField: 'brand',
              localField: '_id',
              match: { isConnected: true, isDeleted: false },
              ref: 'Credential',
              sort: { label: 1 },
            });

            schema.virtual('links', {
              foreignField: 'brand',
              localField: '_id',
              match: { isDeleted: false },
              ref: 'Link',
              select: 'label type url isDeleted',
              sort: { label: 1 },
            });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [
    BrandsService,
    BrandCreditsGuard,
    CreditsInterceptor,
    DefaultRecurringContentService,
  ],
})
export class BrandsModule {}
