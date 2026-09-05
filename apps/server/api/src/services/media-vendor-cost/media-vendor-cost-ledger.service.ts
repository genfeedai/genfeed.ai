import { validatedWorkflowAccountingAttribution } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { scopedWhere } from '@api/index';
import { foldMediaVendorCostGroups } from '@api/services/media-vendor-cost/media-vendor-cost-aggregate.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IMediaVendorCostModelAggregate,
  IMediaVendorCostRangeQuery,
  IMediaVendorCostRecordInput,
} from '@genfeedai/contracts/interfaces';
import { resolveProviderCostUnits } from '@genfeedai/pricing';
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
    const continuation = input.ingredientId
      ? await this.prisma.workflowNodeContinuation.findFirst({
          where: {
            organizationId: input.organizationId,
            ingredientId: input.ingredientId,
            execution: {
              organizationId: input.organizationId,
              isDeleted: false,
            },
          },
          select: { id: true, executionId: true, nodeId: true },
        })
      : null;
    const intent = continuation
      ? await this.prisma.mediaVendorCost.findFirst({
          where: {
            organizationId: input.organizationId,
            isDeleted: false,
            ingredientId: input.ingredientId,
            workflowExecutionId: continuation.executionId,
          },
          select: { pricingSnapshot: true, costEvidence: true },
        })
      : null;
    const stamp =
      intent?.pricingSnapshot &&
      typeof intent.pricingSnapshot === 'object' &&
      !Array.isArray(intent.pricingSnapshot)
        ? intent.pricingSnapshot
        : null;
    const pinnedPrice =
      stamp && typeof stamp.providerCostUsd === 'number'
        ? stamp.providerCostUsd
        : null;
    const pinnedType =
      stamp && typeof stamp.pricingType === 'string' ? stamp.pricingType : null;
    const hasRealizedUnits =
      pinnedType === 'flat' ||
      pinnedType === 'per-request' ||
      (pinnedType === 'per-second' &&
        (input.realizedDurationSeconds ?? 0) > 0) ||
      (pinnedType === 'per-megapixel' &&
        (input.realizedWidth ?? 0) > 0 &&
        (input.realizedHeight ?? 0) > 0);
    const realizedUnits = hasRealizedUnits
      ? resolveProviderCostUnits(pinnedType, null, {
          duration: input.realizedDurationSeconds ?? undefined,
          width: input.realizedWidth ?? undefined,
          height: input.realizedHeight ?? undefined,
        })
      : 0;
    const isByok = intent ? stamp?.isByok === true : input.isByok;
    const scopedCost = isByok
      ? 0
      : input.costEvidence === 'observed'
        ? input.vendorCostMicros
        : pinnedPrice !== null && hasRealizedUnits
          ? Math.round(pinnedPrice * realizedUnits * 1_000_000)
          : null;
    const data = {
      ...(await validatedWorkflowAccountingAttribution(
        this.prisma,
        input.organizationId,
      )),
      ...(continuation
        ? {
            workflowExecutionId: continuation.executionId,
            workflowNodeId: continuation.nodeId,
            workflowOperationId: continuation.id,
          }
        : {}),
      costEvidence: intent
        ? isByok
          ? 'byok'
          : input.costEvidence === 'observed'
            ? 'observed'
            : scopedCost !== null
              ? 'calculated'
              : 'unknown'
        : (input.costEvidence ?? 'unknown'),
      brandId: input.brandId ?? null,
      category: input.category,
      idempotencyKey: input.ingredientId
        ? `media:${input.organizationId}:${input.ingredientId}`
        : null,
      ingredientId: input.ingredientId,
      isByok,
      isDeleted: false,
      model: input.model,
      organizationId: input.organizationId,
      pricingType: input.pricingType,
      provider: input.provider,
      units: intent ? realizedUnits : input.units,
      vendorCostMicros: intent ? (scopedCost ?? 0) : input.vendorCostMicros,
    };

    if (intent && data.idempotencyKey) {
      await this.prisma.mediaVendorCost.updateMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          idempotencyKey: data.idempotencyKey,
          costEvidence: {
            in:
              input.costEvidence === 'observed'
                ? ['pending', 'unknown', 'calculated']
                : ['pending', 'unknown'],
          },
        },
        data: {
          costEvidence: data.costEvidence,
          vendorCostMicros: data.vendorCostMicros,
          units: data.units,
          brandId: data.brandId,
          isByok: data.isByok,
        },
      });
      return;
    }
    if (data.idempotencyKey) {
      await this.prisma.mediaVendorCost.upsert({
        create: data,
        update: {},
        where: scopedWhere(input.organizationId, {
          idempotencyKey: data.idempotencyKey,
        }),
      });
      return;
    }

    await this.prisma.mediaVendorCost.create({
      data: {
        ...data,
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
