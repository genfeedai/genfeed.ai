/**
 * Outreach Campaigns Module
 * Manages marketing campaign configurations for proactive outreach.
 * Supports manual target addition, AI-powered discovery, and scheduled blasts.
 */

import { CampaignTargetsModule } from '@api/collections/campaign-targets/campaign-targets.module';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import {
  OutreachCampaign,
  OutreachCampaignSchema,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CampaignModule } from '@api/services/campaign/campaign.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [OutreachCampaignsController],
  exports: [OutreachCampaignsService, MongooseModule],
  imports: [
    forwardRef(() => CampaignModule),
    forwardRef(() => CampaignTargetsModule),
    MongooseModule.forFeatureAsync(
      [
        {
          name: OutreachCampaign.name,
          useFactory: () => {
            const schema = OutreachCampaignSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Compound index for efficient queries
            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for credential lookups
            schema.index(
              { credential: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for platform and type queries
            schema.index(
              { campaignType: 1, isDeleted: 1, organization: 1, platform: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [OutreachCampaignsService],
})
export class OutreachCampaignsModule {}
