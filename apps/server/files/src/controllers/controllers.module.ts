import { FilesController } from '@files/controllers/files.controller';
import { CronModule } from '@files/cron/cron.module';
import { QueuesModule } from '@files/queues/queues.module';
import { ServicesModule } from '@files/services/services.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [FilesController],
  imports: [QueuesModule, ServicesModule, CronModule],
})
export class ControllersModule {}
