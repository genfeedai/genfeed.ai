import { foldMediaVendorCostGroups } from '@api/services/media-vendor-cost/media-vendor-cost-aggregate.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IMediaVendorCostModelAggregate,
  IMediaVendorCostRangeQuery,
  IMediaVendorCostRecordInput,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MediaVendorCostLedgerService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async record(input: IMediaVendorCostRecordInput): Promise<void> {
    await this.prisma.mediaVendorCost.create({
      data: {
        category: input.category,
        ingredientId: input.ingredientId,
        isByok: input.isByok,
        isDeleted: false,
        model: input.model,
        organizationId: input.organizationId,
        pricingType: input.pricingType,
        provider: input.provider,
        units: input.units,
        vendorCostMicros: input.vendorCostMicros,
      },
    });
  }

  async aggregateByOrgModel(
    query: IMediaVendorCostRangeQuery,
  ): Promise<IMediaVendorCostModelAggregate[]> {
    const rows = await this.prisma.mediaVendorCost.groupBy({
      _count: { _all: true },
      _sum: {
        units: true,
        vendorCostMicros: true,
      },
      by: ['model', 'provider', 'isByok'],
      where: {
        createdAt: {
          gte: query.from,
          lte: query.to,
        },
        isDeleted: false,
        organizationId: query.organizationId,
      },
    });

    this.logger.debug(
      `${this.constructorName} aggregated ${rows.length} vendor-cost groups`,
      { organizationId: query.organizationId },
    );

    return foldMediaVendorCostGroups(rows);
  }
}
