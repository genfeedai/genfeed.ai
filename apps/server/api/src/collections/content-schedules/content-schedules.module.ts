import { ContentSchedulesController } from '@api/collections/content-schedules/controllers/content-schedules.controller';
import { ContentSchedulesService } from '@api/collections/content-schedules/services/content-schedules.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ContentSchedulesController],
  exports: [ContentSchedulesService],
  imports: [],
  providers: [ContentSchedulesService],
})
export class ContentSchedulesModule {}
