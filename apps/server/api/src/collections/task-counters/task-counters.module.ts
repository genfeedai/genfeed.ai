import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [TaskCountersService],
  imports: [LoggerModule],
  providers: [TaskCountersService],
})
export class TaskCountersModule {}
