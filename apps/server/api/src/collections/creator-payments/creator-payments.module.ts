/**
 * Creator payments (#9714): readers pay creators in credits through one
 * transfer ledger: tips, creator subscriptions and paid article unlocks.
 */

import { CreatorArticleAccessController } from '@api/collections/creator-payments/controllers/creator-article-access.controller';
import { CreatorEarningsController } from '@api/collections/creator-payments/controllers/creator-earnings.controller';
import { CreatorSubscriptionsController } from '@api/collections/creator-payments/controllers/creator-subscriptions.controller';
import { CreatorTipsController } from '@api/collections/creator-payments/controllers/creator-tips.controller';
import { CreatorArticleAccessService } from '@api/collections/creator-payments/services/creator-article-access.service';
import { CreatorDirectoryService } from '@api/collections/creator-payments/services/creator-directory.service';
import { CreatorEarningsService } from '@api/collections/creator-payments/services/creator-earnings.service';
import { CreatorSubscriptionsService } from '@api/collections/creator-payments/services/creator-subscriptions.service';
import { CreatorTipsService } from '@api/collections/creator-payments/services/creator-tips.service';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    CreatorArticleAccessController,
    CreatorEarningsController,
    CreatorSubscriptionsController,
    CreatorTipsController,
  ],
  exports: [
    CreatorArticleAccessService,
    CreatorEarningsService,
    CreatorSubscriptionsService,
    CreatorTipsService,
  ],
  imports: [CreditsModule],
  providers: [
    CreatorArticleAccessService,
    CreatorDirectoryService,
    CreatorEarningsService,
    CreatorSubscriptionsService,
    CreatorTipsService,
  ],
})
export class CreatorPaymentsModule {}
