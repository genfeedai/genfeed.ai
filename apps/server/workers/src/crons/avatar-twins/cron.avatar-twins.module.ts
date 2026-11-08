import { AvatarTwinsModule } from '@api/collections/avatar-twins/avatar-twins.module';
import { Module } from '@nestjs/common';
import { CronAvatarTwinsService } from '@workers/crons/avatar-twins/cron.avatar-twins.service';

@Module({
  exports: [CronAvatarTwinsService],
  imports: [AvatarTwinsModule],
  providers: [CronAvatarTwinsService],
})
export class CronAvatarTwinsModule {}
