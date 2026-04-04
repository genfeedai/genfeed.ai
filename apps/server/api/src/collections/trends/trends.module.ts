import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import {
  Trend,
  TrendSchema,
} from '@api/collections/trends/schemas/trend.schema';
import {
  TrendPreferences,
  TrendPreferencesSchema,
} from '@api/collections/trends/schemas/trend-preferences.schema';
import {
  TrendRemixLineage,
  TrendRemixLineageSchema,
} from '@api/collections/trends/schemas/trend-remix-lineage.schema';
import {
  TrendSourceReference,
  TrendSourceReferenceSchema,
} from '@api/collections/trends/schemas/trend-source-reference.schema';
import {
  TrendSourceReferenceLink,
  TrendSourceReferenceLinkSchema,
} from '@api/collections/trends/schemas/trend-source-reference-link.schema';
import {
  TrendSourceReferenceSnapshot,
  TrendSourceReferenceSnapshotSchema,
} from '@api/collections/trends/schemas/trend-source-reference-snapshot.schema';
import {
  TrendingHashtag,
  TrendingHashtagSchema,
} from '@api/collections/trends/schemas/trending-hashtag.schema';
import {
  TrendingSound,
  TrendingSoundSchema,
} from '@api/collections/trends/schemas/trending-sound.schema';
import {
  TrendingVideo,
  TrendingVideoSchema,
} from '@api/collections/trends/schemas/trending-video.schema';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { TrendContentIdeasService } from '@api/collections/trends/services/modules/trend-content-ideas.service';
import { TrendFetchService } from '@api/collections/trends/services/modules/trend-fetch.service';
import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { TrendsWarmupService } from '@api/collections/trends/services/trends-warmup.service';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { XaiModule } from '@api/services/integrations/xai/xai.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [TrendsController],
  exports: [
    TrendsService,
    TrendPreferencesService,
    TrendReferenceCorpusService,
  ],
  imports: [
    ApifyModule,
    forwardRef(() => BrandsModule),
    ByokModule,
    CacheModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    CredentialsModule,
    InstagramModule,
    LinkedInModule,
    forwardRef(() => ModelsModule),
    ReplicateModule,
    TiktokModule,
    TwitterModule,
    XaiModule,

    MongooseModule.forFeatureAsync(
      [
        {
          name: Trend.name,
          useFactory: () => {
            const schema = TrendSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Platform + Organization + Brand queries
            schema.index({ brand: 1, organization: 1, platform: 1 });

            // Index for current trends (active trends only)
            schema.index({ expiresAt: 1, isCurrent: 1, isDeleted: 1 });

            // Index for historical analysis (trends over time)
            schema.index({ createdAt: -1, platform: 1, topic: 1 });

            // Virality score sorting
            schema.index({ createdAt: -1, viralityScore: -1 });

            // Platform + Virality queries
            schema.index({ platform: 1, viralityScore: -1 });

            // Historical trend analysis index
            schema.index({
              createdAt: -1,
              isDeleted: 1,
              platform: 1,
              topic: 1,
            });

            return schema;
          },
        },
        {
          name: TrendPreferences.name,
          useFactory: () => {
            const schema = TrendPreferencesSchema;

            // Brand-scoped preferences with org-level fallback (`brand: null`).
            schema.index({ brand: 1, isDeleted: 1, organization: 1 });
            schema.index(
              { brand: 1, organization: 1 },
              {
                partialFilterExpression: {
                  isDeleted: false,
                },
                unique: true,
              },
            );

            return schema;
          },
        },
        {
          name: TrendingVideo.name,
          useFactory: () => {
            const schema = TrendingVideoSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Platform + current + virality queries
            schema.index({ isCurrent: 1, platform: 1, viralScore: -1 });

            // Unique constraint for deduplication
            schema.index({ externalId: 1, platform: 1 }, { unique: true });

            // Expiry queries
            schema.index({ expiresAt: 1, isCurrent: 1, isDeleted: 1 });

            return schema;
          },
        },
        {
          name: TrendingHashtag.name,
          useFactory: () => {
            const schema = TrendingHashtagSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Platform + current + virality queries
            schema.index({ isCurrent: 1, platform: 1, viralityScore: -1 });

            // Unique constraint for deduplication
            schema.index({ hashtag: 1, platform: 1 }, { unique: true });

            // Expiry queries
            schema.index({ expiresAt: 1, isCurrent: 1, isDeleted: 1 });

            return schema;
          },
        },
        {
          name: TrendingSound.name,
          useFactory: () => {
            const schema = TrendingSoundSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Current + virality queries
            schema.index({ isCurrent: 1, viralityScore: -1 });

            // Unique constraint for deduplication
            schema.index({ soundId: 1 }, { unique: true });

            // Expiry queries
            schema.index({ expiresAt: 1, isCurrent: 1, isDeleted: 1 });

            return schema;
          },
        },
        {
          name: TrendSourceReference.name,
          useFactory: () => {
            const schema = TrendSourceReferenceSchema;

            schema.index(
              { canonicalUrl: 1, platform: 1 },
              {
                unique: true,
              },
            );
            schema.index({ authorHandle: 1, lastSeenAt: -1, platform: 1 });
            schema.index({ lastSeenAt: -1, platform: 1 });

            return schema;
          },
        },
        {
          name: TrendSourceReferenceSnapshot.name,
          useFactory: () => {
            const schema = TrendSourceReferenceSnapshotSchema;

            schema.index(
              { snapshotDate: 1, sourceReference: 1 },
              {
                unique: true,
              },
            );
            schema.index({ snapshotDate: -1, sourceReference: 1 });

            return schema;
          },
        },
        {
          name: TrendSourceReferenceLink.name,
          useFactory: () => {
            const schema = TrendSourceReferenceLinkSchema;

            schema.index(
              { sourceReference: 1, trend: 1 },
              {
                unique: true,
              },
            );
            schema.index({ matchedAt: -1, trend: 1 });

            return schema;
          },
        },
        {
          name: TrendRemixLineage.name,
          useFactory: () => {
            const schema = TrendRemixLineageSchema;

            schema.index(
              { contentDraft: 1 },
              {
                sparse: true,
                unique: true,
              },
            );
            schema.index(
              { post: 1 },
              {
                sparse: true,
                unique: true,
              },
            );
            schema.index({ brand: 1, createdAt: -1, organization: 1 });
            schema.index({ organization: 1, sourceReferences: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [
    TrendAnalysisService,
    TrendContentIdeasService,
    TrendFetchService,
    TrendFilteringService,
    TrendPreferencesService,
    TrendReferenceCorpusService,
    TrendVideoService,
    TrendsService,
    TrendsWarmupService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class TrendsModule {}
