import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdOptimizationAuditLogsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async create(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const doc = await this.prisma.adOptimizationAuditLog.create({
        data: data as never,
      });
      this.logger.log(
        `${caller} created audit log for run ${data.runId as string}`,
      );
      return doc;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findByOrganization(
    organizationId: string,
    params?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.adOptimizationAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: params?.offset ?? 0,
      take: params?.limit ?? 50,
      where: {
        isDeleted: false,
        organizationId,
      },
    });
  }
}
