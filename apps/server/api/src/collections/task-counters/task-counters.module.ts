import {
  TaskCounter,
  TaskCounterSchema,
} from '@api/collections/task-counters/schemas/task-counter.schema';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [TaskCountersService],
  imports: [
    LoggerModule,
    MongooseModule.forFeature(
      [{ name: TaskCounter.name, schema: TaskCounterSchema }],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [TaskCountersService],
})
export class TaskCountersModule {}
