import { ModelsService } from '@api/collections/models/services/models.service';
import {
  classifyFalSchemaFamily,
  extractFalEndpointSchemas,
  type FalEndpointSchemas,
} from '@api/services/integrations/fal/services/fal-contract';
import { ModelProvider } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
import {
  mapFalPricing,
  type NormalizedFalPrice,
  normalizeFalPrice,
} from '@workers/crons/fal-model-watcher/fal-pricing';
import type { IFalModel } from '@workers/interfaces/model-discovery.interface';
import {
  hashProviderContract,
  isRecord,
} from '@workers/services/provider-contract.util';

export interface FalSyncModelRecord {
  endpoint: string;
  id: string;
  isActive: boolean;
  provider: string;
  reviewedProviderContractVersion?: string | null;
}

export interface FalContractSyncResult {
  drifted: boolean;
  quarantined: boolean;
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

@Injectable()
export class FalModelContractSyncService {
  constructor(private readonly modelsService: ModelsService) {}

  async synchronizeModel(
    model: FalSyncModelRecord,
    providerModel: IFalModel,
    rawPrices: Array<Record<string, unknown>>,
    now = new Date(),
  ): Promise<FalContractSyncResult> {
    const candidate = this.buildCandidate(providerModel, rawPrices);
    const contract =
      await this.modelsService.prisma.modelProviderContract.upsert({
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
          pricing: candidate.pricing as unknown as Prisma.InputJsonValue,
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

    const isReviewed =
      model.reviewedProviderContractVersion === candidate.version;
    if (isReviewed) {
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
