import type { TaskCounterDocument } from '@api/collections/task-counters/schemas/task-counter.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TaskCountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Atomically increment and return the next task number for an organization.
   * Creates the counter document if it doesn't exist.
   */
  async getNextNumber(organizationId: string): Promise<number> {
    // Prisma upsert: find by organizationId, increment lastNumber if exists, create with lastNumber=1 if not
    const existing = await this.prisma.taskCounter.findFirst({
      where: { organizationId },
    });

    let result: TaskCounterDocument;

    if (existing) {
      result = (await this.prisma.taskCounter.update({
        data: { lastNumber: { increment: 1 } },
        where: { id: existing.id },
      })) as unknown as TaskCounterDocument;
    } else {
      result = (await this.prisma.taskCounter.create({
        data: { lastNumber: 1, organizationId },
      })) as unknown as TaskCounterDocument;
    }

    if (!result) {
      this.logger.error('Failed to get next task number', { organizationId });
      throw new Error('Failed to generate next task number');
    }

    return (result as unknown as { lastNumber: number }).lastNumber;
  }
}
