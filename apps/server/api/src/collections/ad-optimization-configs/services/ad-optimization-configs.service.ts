import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdOptimizationConfigsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async findByOrganization(
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.adOptimizationConfig.findFirst({
      where: {
        isDeleted: false,
        organizationId,
      },
    });
  }

  async upsert(
    organizationId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const existing = await this.prisma.adOptimizationConfig.findFirst({
        where: { isDeleted: false, organizationId },
      });

      let result: Record<string, unknown>;
      if (existing) {
        result = await this.prisma.adOptimizationConfig.update({
          data: { ...data, organizationId } as never,
          where: { id: existing.id },
        });
      } else {
        result = await this.prisma.adOptimizationConfig.create({
          data: { ...data, organizationId } as never,
        });
      }

      this.logger.log(
        `${caller} upserted optimization config for org ${organizationId}`,
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findAllEnabled(): Promise<Record<string, unknown>[]> {
    return this.prisma.adOptimizationConfig.findMany({
      where: {
        isDeleted: false,
        isEnabled: true,
      },
    });
  }
}
