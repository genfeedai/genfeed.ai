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
    // Single atomic upsert against the unique `organizationId` column. A
    // read-then-create would race: concurrent first-ever calls for the same
    // organization (e.g. Promise.all over follow-up plan steps) all miss the
    // read and then collide on the unique constraint with P2002.
    const result = (await this.prisma.taskCounter.upsert({
      create: { counter: 1, organizationId },
      update: { counter: { increment: 1 } },
      where: { organizationId },
    })) as unknown as TaskCounterDocument;

    if (!result) {
      this.logger.error('Failed to get next task number', { organizationId });
      throw new Error('Failed to generate next task number');
    }

    return (result as unknown as { counter: number }).counter;
  }
}
