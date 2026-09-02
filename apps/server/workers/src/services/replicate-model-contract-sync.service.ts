import { ModelsService } from '@api/collections/models/services/models.service';
import {
  classifyReplicateSchemaFamily,
  extractReplicateEndpointSchemas,
  type ReplicateEndpointSchemas,
} from '@api/services/integrations/replicate/services/replicate-contract';
import { ModelCategory, ModelProvider, PricingType } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
import type { IReplicateModel } from '@workers/interfaces/model-discovery.interface';
import { hashProviderContract } from '@workers/services/provider-contract.util';

export interface ReplicateSyncModelRecord {
  category: string;
  endpoint: string;
  id: string;
  isActive: boolean;
  pricingType?: string | null;
  providerCostUsd?: number | null;
  reviewedProviderContractVersion?: string | null;
}

export interface ReplicateContractSyncResult {
  drifted: boolean;
  quarantined: boolean;
  version: string;
}

export interface ReplicateContractPricing {
  pricingType: string | null;
  source: 'curated-known-cost' | 'reviewed-registry';
  unitPriceUsd: number | null;
}

interface CandidateContract {
  billingUnit: string | null;
  currency: string | null;
  inputSchema: Record<string, unknown>;
  mappingStatus: 'quarantined' | 'supported';
  openapi: Record<string, unknown>;
  openapiVersion: string | null;
  outputSchema: Record<string, unknown>;
  pricing: Array<Record<string, unknown>>;
  pricingType: string | null;
  schemaFamily: string | null;
  unitPrice: string | null;
  unitPriceMicros: bigint | null;
  unsupportedReason: string | null;
  version: string;
}

const SUPPORTED_PRICING_TYPES = new Set<string>(Object.values(PricingType));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function billingUnitForPricingType(pricingType: string): string {
  switch (pricingType) {
    case PricingType.PER_MEGAPIXEL:
      return 'megapixel';
    case PricingType.PER_SECOND:
      return 'second';
    default:
      return 'request';
  }
}

@Injectable()
export class ReplicateModelContractSyncService {
  constructor(private readonly modelsService: ModelsService) {}

  async synchronizeModel(
    model: ReplicateSyncModelRecord,
    providerModel: IReplicateModel,
    category: ModelCategory,
    pricing: ReplicateContractPricing,
    now = new Date(),
  ): Promise<ReplicateContractSyncResult> {
    const endpoint = `${providerModel.owner}/${providerModel.name}`;
    const candidate = this.buildCandidate(
      endpoint,
      providerModel,
      category,
      pricing,
    );
    const contract =
      await this.modelsService.prisma.modelProviderContract.upsert({
        create: {
          billingUnit: candidate.billingUnit,
          conditionalDimensions: {} as Prisma.InputJsonValue,
          currency: candidate.currency,
          endpoint,
          inputSchema: candidate.inputSchema as Prisma.InputJsonValue,
          lastSeenAt: now,
          mappingStatus: candidate.mappingStatus,
          modelId: model.id,
          openapi: candidate.openapi as Prisma.InputJsonValue,
          openapiVersion: candidate.openapiVersion,
          outputSchema: candidate.outputSchema as Prisma.InputJsonValue,
          pricing: candidate.pricing as Prisma.InputJsonValue,
          pricingType: candidate.pricingType,
          provider: ModelProvider.REPLICATE,
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
            endpoint,
            provider: ModelProvider.REPLICATE,
            version: candidate.version,
          },
        },
      });

    if (model.reviewedProviderContractVersion === candidate.version) {
      await this.modelsService.prisma.model.update({
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

    const quarantined = candidate.mappingStatus === 'quarantined';
    const activationPatch =
      model.isActive && !model.reviewedProviderContractVersion
        ? {}
        : { isActive: false, isDefault: false };
    await this.modelsService.prisma.model.update({
      data: {
        ...activationPatch,
        pendingProviderContractVersion: candidate.version,
        providerPricingSyncedAt: now,
        providerSchemaSyncedAt: now,
        providerSyncFailedAt: null,
        providerSyncFailureCode: null,
        providerSyncStatus: quarantined ? 'quarantined' : 'review_required',
      },
      where: { id: model.id },
    });

    return {
      drifted: Boolean(model.reviewedProviderContractVersion),
      quarantined,
      version: contract.version,
    };
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
        provider: ModelProvider.REPLICATE,
      },
    });
  }

  private buildCandidate(
    endpoint: string,
    model: IReplicateModel,
    category: ModelCategory,
    pricing: ReplicateContractPricing,
  ): CandidateContract {
    const openapi = isRecord(model.latest_version?.openapi_schema)
      ? model.latest_version.openapi_schema
      : {};
    let schemas: ReplicateEndpointSchemas = { input: {}, output: {} };
    let schemaFamily: string | null = null;
    let unsupportedReason: string | null = null;

    try {
      schemas = extractReplicateEndpointSchemas(openapi);
      schemaFamily = classifyReplicateSchemaFamily(
        category,
        schemas.input,
        schemas.output,
      );
      if (!schemaFamily) unsupportedReason = 'unsupported_schema_family';
    } catch {
      unsupportedReason = 'invalid_or_missing_openapi';
    }

    const hasPricing =
      typeof pricing.unitPriceUsd === 'number' &&
      Number.isFinite(pricing.unitPriceUsd) &&
      pricing.unitPriceUsd > 0 &&
      typeof pricing.pricingType === 'string' &&
      SUPPORTED_PRICING_TYPES.has(pricing.pricingType);
    if (!hasPricing) unsupportedReason ??= 'missing_reviewed_pricing';

    const pricingSnapshot = hasPricing
      ? [
          {
            currency: 'USD',
            pricingType: pricing.pricingType,
            source: pricing.source,
            unitPrice: String(pricing.unitPriceUsd),
          },
        ]
      : [];
    const supported = Boolean(schemaFamily && hasPricing);
    const candidateWithoutVersion = {
      endpoint,
      inputSchema: schemas.input,
      openapi,
      outputSchema: schemas.output,
      pricing: pricingSnapshot,
      providerVersion: model.latest_version?.id ?? null,
      schemaFamily,
    };

    return {
      billingUnit:
        hasPricing && pricing.pricingType
          ? billingUnitForPricingType(pricing.pricingType)
          : null,
      currency: hasPricing ? 'USD' : null,
      inputSchema: schemas.input,
      mappingStatus: supported ? 'supported' : 'quarantined',
      openapi,
      openapiVersion:
        typeof openapi.openapi === 'string' ? openapi.openapi : null,
      outputSchema: schemas.output,
      pricing: pricingSnapshot,
      pricingType: hasPricing ? pricing.pricingType : null,
      schemaFamily,
      unitPrice: hasPricing ? String(pricing.unitPriceUsd) : null,
      unitPriceMicros: hasPricing
        ? BigInt(Math.round((pricing.unitPriceUsd as number) * 1_000_000))
        : null,
      unsupportedReason,
      version: hashProviderContract(candidateWithoutVersion),
    };
  }
}
