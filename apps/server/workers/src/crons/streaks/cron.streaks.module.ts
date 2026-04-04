import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { Module } from '@nestjs/common';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';

@Module({
  imports: [StreaksModule],
  providers: [CronStreaksService],
})
export class CronStreaksModule {}
