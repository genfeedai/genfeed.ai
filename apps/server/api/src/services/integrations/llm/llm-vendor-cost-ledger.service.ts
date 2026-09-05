import { validatedWorkflowAccountingAttribution } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { foldLlmVendorCostGroups } from '@api/services/integrations/llm/llm-vendor-cost-aggregate.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ILlmVendorCostModelAggregate,
  ILlmVendorCostRangeQuery,
  ILlmVendorCostRecordInput,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LlmVendorCostLedgerService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async record(input: ILlmVendorCostRecordInput): Promise<void> {
    const data = {
      ...(await validatedWorkflowAccountingAttribution(
        this.prisma,
        input.organizationId,
      )),
      costEvidence: input.costEvidence ?? 'unknown',
      ...(input.pricingSnapshot
        ? { pricingSnapshot: input.pricingSnapshot }
        : {}),
      brandId: input.brandId,
      completionTokens: input.completionTokens,
      isByok: input.isByok,
      isDeleted: false,
      latencyMs: input.latencyMs,
      model: input.model,
      organizationId: input.organizationId,
      promptTokens: input.promptTokens,
      provider: input.provider,
      runId: input.runId,
      threadId: input.threadId,
      vendorCostMicros: input.vendorCostMicros,
    };
    if (input.workflowLedgerId && input.costEvidence === 'pending') {
      await this.prisma.llmVendorCost.create({
        data: {
          ...data,
          id: input.workflowLedgerId,
          workflowOperationId: input.workflowLedgerId,
        },
      });
    } else if (input.workflowLedgerId) {
      await this.prisma.llmVendorCost.updateMany({
        where: {
          id: input.workflowLedgerId,
          organizationId: input.organizationId,
          isDeleted: false,
          costEvidence: {
            in:
              input.costEvidence === 'observed'
                ? ['pending', 'unknown', 'calculated']
                : ['pending', 'unknown'],
          },
        },
        data: {
          completionTokens: data.completionTokens,
          promptTokens: data.promptTokens,
          latencyMs: data.latencyMs,
          vendorCostMicros: data.vendorCostMicros,
          costEvidence: data.costEvidence,
          model: data.model,
          ...(input.pricingSnapshot
            ? { pricingSnapshot: input.pricingSnapshot }
            : {}),
        },
      });
    } else {
      await this.prisma.llmVendorCost.create({ data });
    }
  }

  async aggregateByOrgModel(
    query: ILlmVendorCostRangeQuery,
  ): Promise<ILlmVendorCostModelAggregate[]> {
    const rows = await this.prisma.llmVendorCost.groupBy({
      _count: { _all: true },
      _sum: {
        completionTokens: true,
        promptTokens: true,
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

    return foldLlmVendorCostGroups(rows);
  }
}
