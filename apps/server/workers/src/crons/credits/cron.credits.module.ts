import { CreditsModule } from '@api/collections/credits/credits.module';
import { ReferralsModule } from '@api/collections/referrals/referrals.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { Module } from '@nestjs/common';
import { CronCreditsService } from '@workers/crons/credits/cron.credits.service';

@Module({
  exports: [CronCreditsService],
  imports: [CacheModule, CreditsModule, ReferralsModule],
  providers: [CronCreditsService],
})
export class CronCreditsModule {}
