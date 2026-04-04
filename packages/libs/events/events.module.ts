import { EventsService } from '@libs/events/events.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [EventsService],
  imports: [LoggerModule],
  providers: [EventsService],
})
export class EventsModule {}
