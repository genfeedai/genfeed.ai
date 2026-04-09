/**
 * Credentials Module
 * Third-party credentials: store API keys for external services (OpenAI, Replicate, etc),
encrypted credential storage, and credential rotation.
 */
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import {
  Credential,
  CredentialSchema,
} from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { TagsModule } from '@api/collections/tags/tags.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { FacebookModule } from '@api/services/integrations/facebook/facebook.module';
import { GoogleAdsModule } from '@api/services/integrations/google-ads/google-ads.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { RedditModule } from '@api/services/integrations/reddit/reddit.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { QuotaModule } from '@api/services/quota/quota.module';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [CredentialsController],
  exports: [MongooseModule, CredentialsService],
  imports: [
    forwardRef(() => QuotaModule),

    forwardRef(() => BrandsModule),
    forwardRef(() => FacebookModule),
    forwardRef(() => GoogleAdsModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => LinkedInModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PinterestModule),
    forwardRef(() => RedditModule),
    forwardRef(() => TagsModule),
    forwardRef(() => TiktokModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => YoutubeModule),

    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Credential.name,
          useFactory: () => {
            const schema = CredentialSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Brand-scoped queries
            schema.index(
              { brand: 1, createdAt: -1, isDeleted: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Platform-specific queries
            schema.index(
              { isDeleted: 1, organization: 1, platform: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Pre-hook to encrypt refreshToken on updates
            function encryptRefreshTokenPreHook(this: unknown) {
              const update = this.getUpdate();

              if (update?.refreshToken) {
                update.refreshToken = EncryptionUtil.encrypt(
                  update.refreshToken,
                );
              }

              if (update?.$set?.refreshToken) {
                update.$set.refreshToken = EncryptionUtil.encrypt(
                  update.$set.refreshToken,
                );
              }
            }

            schema.pre('findOneAndUpdate', encryptRefreshTokenPreHook);

            schema.pre('updateOne', encryptRefreshTokenPreHook);
            schema.pre('updateMany', encryptRefreshTokenPreHook);

            // User + brand credentials
            schema.index({
              brand: 1,
              user: 1,
            });

            // Existing unique constraint
            schema.index(
              { brand: 1, organization: 1, platform: 1, user: 1 },
              { unique: true },
            );

            // Handle-based lookup for agent @handle resolution
            schema.index(
              {
                externalHandle: 1,
                isConnected: 1,
                isDeleted: 1,
                organization: 1,
              },
              {
                partialFilterExpression: {
                  isConnected: true,
                  isDeleted: false,
                },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [CredentialsService],
})
export class CredentialsModule {}
