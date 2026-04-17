/**
 * Credentials Module
 * Third-party credentials: store API keys for external services (OpenAI, Replicate, etc),
encrypted credential storage, and credential rotation.
 */
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
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
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [CredentialsController],
  exports: [CredentialsService],
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
  ],
  providers: [CredentialsService],
})
export class CredentialsModule {}
