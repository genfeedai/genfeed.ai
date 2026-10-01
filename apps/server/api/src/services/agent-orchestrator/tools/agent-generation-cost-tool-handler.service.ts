import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';
import type { AgentToolResult, IModel } from '@genfeedai/contracts/interfaces';
import type { StudioGenerationCostEstimate } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { Injectable } from '@nestjs/common';
import {
  buildStudioGenerationCostSettings,
  resolveStudioGenerationCost,
} from '@pages/studio/generate/utils/studio-generation-cost';

const UNAVAILABLE_ESTIMATE: StudioGenerationCostEstimate = {
  credits: null,
  status: 'unavailable',
};

function isEnumValue<T extends Record<string, string>>(
  enumeration: T,
  value: string,
): value is T[keyof T] {
  return (Object.values(enumeration) as string[]).includes(value);
}

function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function readReviewStatus(value: string | null): IModel['reviewStatus'] {
  if (
    value === 'approved' ||
    value === 'legacy' ||
    value === 'pending' ||
    value === 'rejected'
  ) {
    return value;
  }
  return undefined;
}

function readProviderSyncStatus(
  value: string | null,
): IModel['providerSyncStatus'] {
  if (
    value === 'failed' ||
    value === 'fresh' ||
    value === 'quarantined' ||
    value === 'review_required'
  ) {
    return value;
  }
  return undefined;
}

/** Catalog row the Generate composer already prices. Unknown tariffs stay unpriced. */
export function toStudioGenerationCostModel(
  model: ModelDocument,
): IModel | null {
  if (
    !isEnumValue(ModelCategory, model.category) ||
    !isEnumValue(ModelProvider, model.provider) ||
    !isEnumValue(ModelLifecycle, model.lifecycle)
  ) {
    return null;
  }
  if (
    typeof model.pricingType === 'string' &&
    model.pricingType.length > 0 &&
    !isEnumValue(PricingType, model.pricingType)
  ) {
    return null;
  }

  return {
    category: model.category,
    cost: model.cost,
    costPerUnit: model.costPerUnit ?? undefined,
    createdAt: isoTimestamp(model.createdAt),
    id: model.id,
    isActive: model.isActive,
    isDefault: model.isDefault,
    isDeleted: model.isDeleted,
    isFree: model.isFree,
    key: model.key,
    label: model.label,
    lifecycle: model.lifecycle,
    minCost: model.minCost ?? undefined,
    pendingProviderContractVersion:
      model.pendingProviderContractVersion ?? undefined,
    pricingType:
      model.pricingType && isEnumValue(PricingType, model.pricingType)
        ? model.pricingType
        : undefined,
    provider: model.provider,
    providerSyncStatus: readProviderSyncStatus(model.providerSyncStatus),
    reviewStatus: readReviewStatus(model.reviewStatus),
    updatedAt: isoTimestamp(model.updatedAt),
  };
}

function readOptionalString(
  value: unknown,
): { ok: true; value?: string } | { ok: false } {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length > 0 ? trimmed : undefined };
}

function readOptionalNumber(
  value: unknown,
): { ok: true; value?: number } | { ok: false } {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'number') return { ok: false };
  return { ok: true, value };
}

function readFiniteBalance(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/**
 * Read-only Studio estimate plus the credits-bar balance.
 * Prices nothing itself: both numbers come from the existing catalog estimate and wallet.
 */
@Injectable()
export class AgentGenerationCostToolHandler {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  async execute(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const balance = await this.readBalance(ctx.organizationId);
    const type =
      params.type === 'image' || params.type === 'video' ? params.type : null;
    const modelKey = readOptionalString(params.modelKey);
    const aspectRatio = readOptionalString(params.aspectRatio);
    const resolution = readOptionalString(params.resolution);
    const duration = readOptionalNumber(params.duration);
    const outputs = readOptionalNumber(params.outputs);
    if (
      !type ||
      !modelKey.ok ||
      !aspectRatio.ok ||
      !resolution.ok ||
      !duration.ok ||
      !outputs.ok
    ) {
      return this.result(balance, UNAVAILABLE_ESTIMATE);
    }

    const settings = buildStudioGenerationCostSettings(type, {
      aspectRatio: aspectRatio.value,
      duration: duration.value,
      modelKey: modelKey.value,
      outputs: outputs.value,
      resolution: resolution.value,
    });
    if (
      settings.modelKey === '__auto_model__' ||
      settings.modelKey === 'auto' ||
      settings.modelKey === ''
    ) {
      return this.result(
        balance,
        resolveStudioGenerationCost({
          isLoadingModels: false,
          settings,
          type,
        }),
      );
    }

    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: settings.modelKey,
      organizationId: ctx.organizationId,
    });
    const priced = model ? toStudioGenerationCostModel(model) : null;
    return this.result(
      balance,
      priced
        ? resolveStudioGenerationCost({
            isLoadingModels: false,
            model: priced,
            settings,
            type,
          })
        : UNAVAILABLE_ESTIMATE,
    );
  }

  private async readBalance(organizationId: string): Promise<number | null> {
    try {
      return readFiniteBalance(
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        ),
      );
    } catch {
      return null;
    }
  }

  private result(
    balance: number | null,
    estimate: StudioGenerationCostEstimate,
  ): AgentToolResult {
    return {
      creditsUsed: 0,
      data: { balance, estimate },
      success: true,
    };
  }
}
