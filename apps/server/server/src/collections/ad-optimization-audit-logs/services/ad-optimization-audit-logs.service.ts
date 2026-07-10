import type { Prisma } from '@genfeedai/prisma';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Inject, Injectable } from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPrisma,
} from '@server/server.dependencies';

@Injectable()
export class AdOptimizationAuditLogsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<ServerPrisma, 'adOptimizationAuditLog'>,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async create(payload: {
    organizationId: string;
    data: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const doc = await this.prisma.adOptimizationAuditLog.create({
        data: {
          organizationId: payload.organizationId,
          data: payload.data as Prisma.InputJsonValue,
        },
      });
      this.logger.log(
        `${caller} created audit log for run ${payload.data.runId as string}`,
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
