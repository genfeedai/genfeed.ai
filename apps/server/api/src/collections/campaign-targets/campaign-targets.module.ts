/**
 * Campaign Targets Module
 * Manages individual targets for marketing campaigns.
 * Tracks status, reply content, and processing metadata.
 */
import {
  CampaignTarget,
  CampaignTargetSchema,
} from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  exports: [CampaignTargetsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: CampaignTarget.name,
          useFactory: () => {
            const schema = CampaignTargetSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Compound index for campaign and status queries
            schema.index(
              { campaign: 1, isDeleted: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for scheduled targets
            schema.index(
              { campaign: 1, scheduledAt: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for external ID lookups (prevent duplicates)
            schema.index(
              { campaign: 1, externalId: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for organization queries
            schema.index(
              { isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [CampaignTargetsService],
})
export class CampaignTargetsModule {}
