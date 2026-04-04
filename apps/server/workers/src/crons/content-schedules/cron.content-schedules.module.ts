import { ContentSchedulesModule } from '@api/collections/content-schedules/content-schedules.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { ContentGatewayModule } from '@api/services/content-gateway/content-gateway.module';
import { Module } from '@nestjs/common';
import { CronContentSchedulesService } from '@workers/crons/content-schedules/cron.content-schedules.service';

@Module({
  exports: [CronContentSchedulesService],
  imports: [CacheModule, ContentSchedulesModule, ContentGatewayModule],
  providers: [CronContentSchedulesService],
})
export class CronContentSchedulesModule {}
