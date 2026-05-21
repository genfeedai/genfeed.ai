/**
 * Credentials Module (Full)
 * Includes CredentialsController with platform token refresh + quota endpoints.
 * Most callers should import CredentialsCoreModule instead.
 */
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { TagsModule } from '@api/collections/tags/tags.module';
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
import { Module } from '@nestjs/common';

@Module({
  controllers: [CredentialsController],
  exports: [CredentialsCoreModule],
  imports: [
    BrandsModule,
    CredentialsCoreModule,
    FacebookModule,
    GoogleAdsModule,
    InstagramModule,
    LinkedInModule,
    OrganizationsModule,
    PinterestModule,
    QuotaModule,
    RedditModule,
    TagsModule,
    TiktokModule,
    TwitterModule,
    YoutubeModule,
  ],
})
export class CredentialsModule {}
