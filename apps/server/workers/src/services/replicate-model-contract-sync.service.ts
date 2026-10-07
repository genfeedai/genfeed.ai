import {
  prepareReplicateModelContract,
  type ReplicateCandidateContract,
  type ReplicateContractPricing,
} from '@workers/services/replicate-model-contract.util';

export type { ReplicateContractPricing } from '@workers/services/replicate-model-contract.util';
export { REPLICATE_BILLING_SOURCE } from '@workers/services/replicate-model-contract.util';

import { ModelsService } from '@api/collections/models/services/models.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import type { ReviewedProviderPricing } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { Injectable } from '@nestjs/common';
import type { IReplicateModel } from '@workers/interfaces/model-discovery.interface';
import type {
  ModelPriceChangeAlert,
  ModelPricingUnavailableAlert,
} from '@workers/services/model-pricing-alerts.util';
import {
  compareProviderRates,
  loadReviewedRateContract,
  reviewedSchemaRepair,
} from '@workers/services/provider-rate-sync.util';

export interface ReplicateSyncModelRecord {
  category: string;
  endpoint: string;
  id: string;
  isActive: boolean;
  isFree?: boolean;
  key?: string;
  pricingType?: string | null;
  providerCostUsd?: number | null;
  reviewedProviderContractVersion?: string | null;
}

export interface ReplicateContractSyncResult {
  drifted: boolean;
  /** Set when the observed rates differ from the reviewed ones. */
  priceChange?: ModelPriceChangeAlert;
  quarantined: boolean;
  /** Set when a reviewed model's rates could not be read from the refresh. */
  refreshFailure?: ModelPricingUnavailableAlert;
  version: string;
}

@Injectable()
export class ReplicateModelContractSyncService {
  constructor(private readonly modelsService: ModelsService) {}

  /**
   * Refresh one endpoint. Reviewed prices are never replaced or expired by a
   * sync: identical observed rates re-verify the reviewed contract, different
   * ones become a pending candidate for an operator and keep the model active
   * and charging the approved rate.
   */
  async synchronizeModel(
    model: ReplicateSyncModelRecord,
    providerModel: IReplicateModel,
    category: ModelCategory,
    pricing: ReplicateContractPricing,
    now = new Date(),
  ): Promise<ReplicateContractSyncResult> {
    const endpoint = `${providerModel.owner}/${providerModel.name}`;
    const modelKey = model.key ?? endpoint;
    const prisma = this.modelsService.prisma;
    const candidate = prepareReplicateModelContract(
      endpoint,
      providerModel,
      category,
      pricing,
      now,
    );
    const reviewed = await loadReviewedRateContract(prisma, {
      endpoint: model.endpoint,
      isFree: model.isFree,
      provider: ModelProvider.REPLICATE,
      reviewedProviderContractVersion: model.reviewedProviderContractVersion,
    });
    const observedPricing = this.observedPricing(candidate, now);
    const comparison =
      reviewed && observedPricing
        ? compareProviderRates(reviewed.pricing, observedPricing)
        : null;

    if (reviewed && comparison?.status === 'unchanged') {
      // The same rates and billing rules observed again: roll verification forward.
      const reviewedPricing = reviewed.contract.pricing;
      if (isRecord(reviewedPricing))
        await prisma.modelProviderContract.update({
          data: {
            lastSeenAt: now,
            ...(reviewedSchemaRepair(reviewed.contract, candidate) ?? {}),
            pricing: {
              ...reviewedPricing,
              verifiedAt: now.toISOString(),
            } as Prisma.InputJsonValue,
          },
          where: { id: reviewed.contract.id },
        });
      await this.markFresh(model.id, now);
      return { drifted: false, quarantined: false, version: candidate.version };
    }

    const contract = await this.upsertCandidate(
      model.id,
      endpoint,
      candidate,
      now,
    );
    const quarantined = candidate.mappingStatus === 'quarantined';

    if (reviewed && comparison?.status === 'changed') {
      // The provider changed a price or billing rule. The reviewed rate keeps charging and the
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
          provider: ModelProvider.REPLICATE,
          sourceUrl: candidate.observed?.sourceUrl ?? null,
        },
        quarantined,
        version: contract.version,
      };
    }

    if (reviewed) {
      // Reviewed rates exist but this refresh produced none we can read.
      const code = `rates_unavailable:${candidate.billingFailure ?? 'no_billing_observation'}`;
      await prisma.model.update({
        data: {
          providerSyncFailedAt: now,
          providerSyncFailureCode: code,
          providerSyncStatus: 'failed',
        },
        where: { id: model.id },
      });
      return {
        drifted: false,
        quarantined,
        refreshFailure: {
          modelKey,
          provider: ModelProvider.REPLICATE,
          reason: `The Replicate price refresh failed (${code}); the last approved rate keeps charging.`,
        },
        version: contract.version,
      };
    }

    if (model.reviewedProviderContractVersion === candidate.version) {
      // The exact contract that was reviewed, on evidence without readable rates.
      await this.markFresh(model.id, now);
      return { drifted: false, quarantined: false, version: contract.version };
    }

    await prisma.model.update({
      data: {
        pendingProviderContractVersion: candidate.version,
        providerPricingSyncedAt: now,
        providerSchemaSyncedAt: now,
        providerSyncFailedAt: candidate.billingFailure ? now : null,
        providerSyncFailureCode: candidate.billingFailure
          ? `rates_unavailable:${candidate.billingFailure}`
          : null,
        providerSyncStatus: quarantined ? 'quarantined' : 'review_required',
      },
      where: { id: model.id },
    });

    // An active model with no reviewed price is red: tell ops whether its
    // rates were read (ready to approve) or why they could not be.
    if (model.isActive)
      return {
        drifted: false,
        quarantined,
        refreshFailure: {
          modelKey,
          provider: ModelProvider.REPLICATE,
          reason: candidate.observed
            ? 'Price missing: provider rates were read and are ready to approve in admin'
            : `Price missing: provider rates could not be read (${candidate.billingFailure ?? 'no_billing_observation'})`,
        },
        version: contract.version,
      };
    return { drifted: false, quarantined, version: contract.version };
  }

  /** The rates this refresh read, shaped like a contract's pricing. */
  private observedPricing(
    candidate: ReplicateCandidateContract,
    now: Date,
  ): ReviewedProviderPricing | null {
    if (!candidate.observed) return null;
    return {
      currency: 'USD',
      rates: candidate.observed.rates,
      variantRules: candidate.observed.variantRules,
      invariantSelectors: candidate.observed.invariantSelectors,
      reviewStatus: 'pending',
      sourceUrl: candidate.observed.sourceUrl,
      verifiedAt: now.toISOString(),
      version: candidate.version,
    };
  }

  /** The reviewed rates were confirmed by this refresh. */
  private async markFresh(modelId: string, now: Date): Promise<void> {
    await this.modelsService.prisma.model.update({
      data: {
        pendingProviderContractVersion: null,
        providerPricingSyncedAt: now,
        providerSchemaSyncedAt: now,
        providerSyncFailedAt: null,
        providerSyncFailureCode: null,
        providerSyncStatus: 'fresh',
      },
      where: { id: modelId },
    });
  }

  private upsertCandidate(
    modelId: string,
    endpoint: string,
    candidate: ReplicateCandidateContract,
    now: Date,
  ) {
    return this.modelsService.prisma.modelProviderContract.upsert({
      create: {
        billingUnit: candidate.billingUnit,
        conditionalDimensions: {} as Prisma.InputJsonValue,
        currency: candidate.currency,
        endpoint,
        inputSchema: candidate.inputSchema as Prisma.InputJsonValue,
        lastSeenAt: now,
        mappingStatus: candidate.mappingStatus,
        modelId,
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
}
