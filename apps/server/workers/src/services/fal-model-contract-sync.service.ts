import { ModelsService } from '@api/collections/models/services/models.service';
import { parseContractReviewedPricing } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import {
  classifyFalSchemaFamily,
  extractFalEndpointSchemas,
  type FalEndpointSchemas,
} from '@api/services/integrations/fal/services/fal-contract';
import { ModelProvider } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { Injectable } from '@nestjs/common';
import {
  mapFalPricing,
  type NormalizedFalPrice,
  normalizeFalPrice,
} from '@workers/crons/fal-model-watcher/fal-pricing';
import type { IFalModel } from '@workers/interfaces/model-discovery.interface';
import type {
  ModelPriceChangeAlert,
  ModelPricingUnavailableAlert,
} from '@workers/services/model-pricing-alerts.util';
import { hashProviderContract } from '@workers/services/provider-contract.util';
import {
  compareProviderRates,
  loadReviewedRateContract,
  reviewedSchemaRepair,
} from '@workers/services/provider-rate-sync.util';

export interface FalSyncModelRecord {
  endpoint: string;
  id: string;
  isActive: boolean;
  isFree?: boolean;
  key?: string;
  provider: string;
  reviewedProviderContractVersion?: string | null;
}

export interface FalContractSyncResult {
  drifted: boolean;
  /** Set when the observed rates differ from the reviewed ones. */
  priceChange?: ModelPriceChangeAlert;
  quarantined: boolean;
  /** Set when a reviewed model's rates could not be read from the refresh. */
  refreshFailure?: ModelPricingUnavailableAlert;
  version: string;
}

interface CandidateContract {
  billingUnit: string | null;
  conditionalDimensions: Record<string, unknown>;
  currency: string | null;
  inputSchema: Record<string, unknown>;
  mappingStatus: 'quarantined' | 'supported';
  openapi: Record<string, unknown>;
  openapiVersion: string | null;
  outputSchema: Record<string, unknown>;
  pricing: NormalizedFalPrice[];
  pricingType: string | null;
  schemaFamily: string | null;
  unitPrice: string | null;
  unitPriceMicros: bigint | null;
  unsupportedReason: string | null;
  version: string;
}

const FAL_PRICING_SOURCE_URL = 'https://api.fal.ai/v1/models/pricing';

@Injectable()
export class FalModelContractSyncService {
  constructor(private readonly modelsService: ModelsService) {}

  /**
   * Refresh one endpoint. Reviewed prices are never replaced or expired by a
   * sync: identical observed rates re-verify the reviewed contract, different
   * ones become a pending candidate for an operator and keep the model active
   * and charging the approved rate.
   */
  async synchronizeModel(
    model: FalSyncModelRecord,
    providerModel: IFalModel,
    rawPrices: Array<Record<string, unknown>>,
    now = new Date(),
  ): Promise<FalContractSyncResult> {
    const candidate = this.buildCandidate(providerModel, rawPrices);
    const prisma = this.modelsService.prisma;
    const modelKey = model.key ?? providerModel.endpoint_id;
    const reviewed = await loadReviewedRateContract(prisma, {
      ...model,
      provider: ModelProvider.FAL,
    });
    const observed = parseContractReviewedPricing(
      {
        endpoint: model.endpoint,
        isFree: model.isFree ?? false,
        provider: ModelProvider.FAL,
      },
      {
        conditionalDimensions:
          candidate.conditionalDimensions as Prisma.JsonValue,
        discoveredAt: now,
        endpoint: providerModel.endpoint_id,
        lastSeenAt: now,
        pricing: candidate.pricing as unknown as Prisma.JsonValue,
        provider: ModelProvider.FAL,
        version: candidate.version,
      },
    );
    const comparison =
      reviewed && observed
        ? compareProviderRates(reviewed.pricing, observed)
        : null;

    if (reviewed && comparison?.status === 'unchanged') {
      // The same rates observed again: roll the verification forward.
      await prisma.modelProviderContract.update({
        data: {
          lastSeenAt: now,
          ...(reviewedSchemaRepair(reviewed.contract, candidate) ?? {}),
        },
        where: { id: reviewed.contract.id },
      });
      await prisma.model.update({
        data: {
          pendingProviderContractVersion: null,
          providerPricingSyncedAt: now,
          providerSchemaSyncedAt: now,
          providerSyncFailedAt: null,
          providerSyncFailureCode: null,
          providerSyncStatus: 'fresh',
        },
        where: { id: model.id },
      });
      return { drifted: false, quarantined: false, version: candidate.version };
    }

    const contract = await prisma.modelProviderContract.upsert({
      create: {
        billingUnit: candidate.billingUnit,
        conditionalDimensions:
          candidate.conditionalDimensions as Prisma.InputJsonValue,
        currency: candidate.currency,
        endpoint: providerModel.endpoint_id,
        inputSchema: candidate.inputSchema as Prisma.InputJsonValue,
        lastSeenAt: now,
        mappingStatus: candidate.mappingStatus,
        modelId: model.id,
        openapi: candidate.openapi as Prisma.InputJsonValue,
        openapiVersion: candidate.openapiVersion,
        outputSchema: candidate.outputSchema as Prisma.InputJsonValue,
        pricing: toPrismaJson(candidate.pricing),
        pricingType: candidate.pricingType,
        provider: ModelProvider.FAL,
        reviewStatus:
          candidate.mappingStatus === 'supported' ? 'pending' : 'quarantined',
        schemaFamily: candidate.schemaFamily,
        unitPrice: candidate.unitPrice,
        unitPriceMicros: candidate.unitPriceMicros,
        unsupportedReason: candidate.unsupportedReason,
        version: candidate.version,
      },
      update: { lastSeenAt: now },
      where: {
        provider_endpoint_version: {
          endpoint: providerModel.endpoint_id,
          provider: ModelProvider.FAL,
          version: candidate.version,
        },
      },
    });

    const quarantined = candidate.mappingStatus === 'quarantined';

    if (reviewed && comparison?.status === 'changed') {
      // The provider changed a price. The reviewed rate keeps charging and the
      // model stays active; an operator approves the pending contract.
      await prisma.model.update({
        data: {
          pendingProviderContractVersion: candidate.version,
          providerPricingSyncedAt: now,
          providerSchemaSyncedAt: now,
          providerSyncFailedAt: null,
          providerSyncFailureCode: null,
          providerSyncStatus: 'review_required',
        },
        where: { id: model.id },
      });
      return {
        drifted: true,
        priceChange: {
          changes: comparison.changes,
          modelKey,
          pendingRateHash: comparison.pendingRateHash,
          provider: ModelProvider.FAL,
          sourceUrl: FAL_PRICING_SOURCE_URL,
        },
        quarantined,
        version: contract.version,
      };
    }

    if (reviewed) {
      // Reviewed rates exist but this refresh produced none we can read.
      const reason = `rates_unavailable:${candidate.unsupportedReason ?? 'unreadable'}`;
      await prisma.model.update({
        data: {
          providerSyncFailedAt: now,
          providerSyncFailureCode: reason,
          providerSyncStatus: 'failed',
        },
        where: { id: model.id },
      });
      return {
        drifted: false,
        quarantined,
        refreshFailure: {
          modelKey,
          provider: ModelProvider.FAL,
          reason: `The fal price refresh produced no readable rate (${reason}); the last approved rate keeps charging.`,
        },
        version: contract.version,
      };
    }

    if (model.reviewedProviderContractVersion === candidate.version) {
      // The exact contract that was reviewed, on evidence without readable rates.
      await prisma.model.update({
        data: {
          pendingProviderContractVersion: null,
          providerPricingSyncedAt: now,
          providerSchemaSyncedAt: now,
          providerSyncFailedAt: null,
          providerSyncFailureCode: null,
          providerSyncStatus: 'fresh',
        },
        where: { id: model.id },
      });
      return { drifted: false, quarantined: false, version: contract.version };
    }

    await prisma.model.update({
      data: {
        pendingProviderContractVersion: candidate.version,
        providerPricingSyncedAt: now,
        providerSchemaSyncedAt: now,
        providerSyncFailedAt: null,
        providerSyncFailureCode: null,
        providerSyncStatus: quarantined ? 'quarantined' : 'review_required',
      },
      where: { id: model.id },
    });
    return { drifted: false, quarantined, version: contract.version };
  }

  async recordFailure(
    code: string,
    now = new Date(),
    modelId?: string,
  ): Promise<void> {
    await this.modelsService.prisma.model.updateMany({
      data: {
        providerSyncFailedAt: now,
        providerSyncFailureCode: code,
        providerSyncStatus: 'failed',
      },
      where: {
        ...(modelId ? { id: modelId } : {}),
        isDeleted: false,
        organizationId: null,
        provider: ModelProvider.FAL,
      },
    });
  }

  private buildCandidate(
    model: IFalModel,
    rawPrices: Array<Record<string, unknown>>,
  ): CandidateContract {
    const openapi = isRecord(model.openapi) ? model.openapi : {};
    const normalizedPrices = rawPrices.map(normalizeFalPrice);
    let schemas: FalEndpointSchemas = { input: {}, output: {} };
    let schemaFamily: string | null = null;
    let unsupportedReason: string | null = null;

    try {
      if (isRecord(openapi.error)) {
        throw new Error('OpenAPI expansion failed');
      }
      schemas = extractFalEndpointSchemas(openapi);
      schemaFamily = classifyFalSchemaFamily(
        model.metadata?.category,
        schemas.input,
        schemas.output,
      );
      if (!schemaFamily) unsupportedReason = 'unsupported_schema_family';
    } catch {
      unsupportedReason = 'invalid_or_missing_openapi';
    }

    const price = normalizedPrices.length === 1 ? normalizedPrices[0] : null;
    const pricingMapping = price ? mapFalPricing(price) : null;
    if (!price) {
      unsupportedReason ??=
        normalizedPrices.length > 1 ? 'ambiguous_pricing' : 'missing_pricing';
    } else if (pricingMapping && !pricingMapping.supported) {
      unsupportedReason ??= pricingMapping.reason;
    }

    const supported = Boolean(schemaFamily && pricingMapping?.supported);
    const candidateWithoutVersion = {
      endpoint: model.endpoint_id,
      inputSchema: schemas.input,
      openapi,
      outputSchema: schemas.output,
      pricing: normalizedPrices,
      schemaFamily,
    };

    return {
      billingUnit: price?.unit ?? null,
      conditionalDimensions: price?.conditionalDimensions ?? {},
      currency: price?.currency ?? null,
      inputSchema: schemas.input,
      mappingStatus: supported ? 'supported' : 'quarantined',
      openapi,
      openapiVersion:
        typeof openapi.openapi === 'string' ? openapi.openapi : null,
      outputSchema: schemas.output,
      pricing: normalizedPrices,
      pricingType:
        pricingMapping?.supported === true ? pricingMapping.pricingType : null,
      schemaFamily,
      unitPrice: price?.unitPrice ?? null,
      unitPriceMicros:
        pricingMapping?.supported === true
          ? pricingMapping.unitPriceMicros
          : null,
      unsupportedReason,
      version: hashProviderContract(candidateWithoutVersion),
    };
  }
}
