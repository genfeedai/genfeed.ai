import {
  TaskCounter,
  type TaskCounterDocument,
} from '@api/collections/task-counters/schemas/task-counter.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class TaskCountersService {
  constructor(
    @InjectModel(TaskCounter.name, DB_CONNECTIONS.CLOUD)
    private readonly model: Model<TaskCounterDocument>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Atomically increment and return the next task number for an organization.
   * Creates the counter document if it doesn't exist.
   */
  async getNextNumber(
    organizationId: string | Types.ObjectId,
  ): Promise<number> {
    const result = await this.model.findOneAndUpdate(
      { organization: new Types.ObjectId(organizationId) },
      { $inc: { lastNumber: 1 } },
      { new: true, upsert: true },
    );

    if (!result) {
      this.logger.error('Failed to get next task number', {
        organizationId: String(organizationId),
      });
      throw new Error('Failed to generate next task number');
    }

    return result.lastNumber;
  }
}
