/**
 * Campaign Module
 *
 * Provides campaign-related services:
 * - CampaignDiscoveryService - AI-powered content discovery
 * - CampaignExecutorService - Target execution and reply posting
 */
import { CampaignTargetsModule } from '@api/collections/campaign-targets/campaign-targets.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { CampaignDiscoveryService } from '@api/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    CampaignDiscoveryService,
    CampaignExecutorService,
    DmCampaignExecutorService,
  ],
  imports: [
    forwardRef(() => CampaignTargetsModule),
    forwardRef(() => OutreachCampaignsModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => ReplyBotModule),
  ],
  providers: [
    CampaignDiscoveryService,
    CampaignExecutorService,
    DmCampaignExecutorService,
  ],
})
export class CampaignModule {}
