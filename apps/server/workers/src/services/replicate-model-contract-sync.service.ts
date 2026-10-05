import { ModelsService } from '@api/collections/models/services/models.service';
import { deriveRequiredSelectorKeys } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import {
  classifyReplicateSchemaFamily,
  extractReplicateEndpointSchemas,
  type ReplicateEndpointSchemas,
} from '@api/services/integrations/replicate/services/replicate-contract';
import {
  ModelCategory,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';
import type {
  ReviewedProviderPricing,
  ReviewedProviderRate,
} from '@genfeedai/contracts/interfaces';
import {
  mapReplicateBillingTiers,
  type ReplicateBillingObservation,
} from '@genfeedai/pricing';
import type { Prisma } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { hashReplicateProviderContract } from '@libs/utils/provider-contract.util';
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

export interface ReplicateContractPricing {
  /** What the public model page said about billing (#6196). */
  billing?: ReplicateBillingObservation;
  pricingType: string | null;
  source: 'curated-known-cost' | 'reviewed-registry';
  unitPriceUsd: number | null;
}

interface ObservedRates {
  invariantSelectors: string[];
  rates: ReviewedProviderRate[];
  selectorKeys: string[];
  sourceUrl: string;
}

interface CandidateContract {
  billingFailure: string | null;
  billingUnit: string | null;
  currency: string | null;
  inputSchema: Record<string, unknown>;
  mappingStatus: 'quarantined' | 'supported';
  observed: ObservedRates | null;
  openapi: Record<string, unknown>;
  openapiVersion: string | null;
  outputSchema: Record<string, unknown>;
  pricing: unknown;
  pricingType: string | null;
  schemaFamily: string | null;
  unitPrice: string | null;
  unitPriceMicros: bigint | null;
  unsupportedReason: string | null;
  version: string;
}

const SUPPORTED_PRICING_TYPES = new Set<string>(Object.values(PricingType));
export const REPLICATE_BILLING_SOURCE = 'replicate-billing-config';

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
    const candidate = this.buildCandidate(
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
    const observedPricing: ReviewedProviderPricing | null = candidate.observed
      ? {
          currency: 'USD',
          rates: candidate.observed.rates,
          reviewStatus: 'pending',
          sourceUrl: candidate.observed.sourceUrl,
          verifiedAt: now.toISOString(),
          version: candidate.version,
        }
      : null;
    const comparison =
      reviewed && observedPricing
        ? compareProviderRates(reviewed.pricing, observedPricing)
        : null;

    if (reviewed && comparison?.status === 'unchanged') {
      // The same rates observed again: roll the verification forward.
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
    now: Date,
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

    const { billingFailure, observed } = this.observeRates(
      pricing.billing,
      schemas.input,
    );

    const hasCuratedPricing =
      typeof pricing.unitPriceUsd === 'number' &&
      Number.isFinite(pricing.unitPriceUsd) &&
      pricing.unitPriceUsd > 0 &&
      typeof pricing.pricingType === 'string' &&
      SUPPORTED_PRICING_TYPES.has(pricing.pricingType);
    const hasPricing = observed !== null || hasCuratedPricing;
    if (!hasPricing) unsupportedReason ??= 'missing_reviewed_pricing';

    // Rates the page states outrank the curated registry value.
    const observedSnapshot = observed
      ? {
          currency: 'USD',
          rates: observed.rates,
          source: REPLICATE_BILLING_SOURCE,
          sourceUrl: observed.sourceUrl,
          ...(observed.invariantSelectors.length
            ? { invariantSelectors: observed.invariantSelectors }
            : {}),
        }
      : null;
    const pricingSnapshot: unknown = observedSnapshot
      ? { ...observedSnapshot, verifiedAt: now.toISOString() }
      : hasCuratedPricing
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
    // `verifiedAt` is a moving date, so it stays out of the version identity.
    const candidateWithoutVersion = {
      endpoint,
      inputSchema: schemas.input,
      openapi,
      outputSchema: schemas.output,
      pricing: observedSnapshot ?? pricingSnapshot,
      providerVersion: model.latest_version?.id ?? null,
      schemaFamily,
    };
    const single =
      observed && observed.rates.length === 1 ? observed.rates[0] : undefined;

    return {
      billingFailure,
      billingUnit: observed
        ? (observed.rates[0]?.unit ?? null)
        : hasCuratedPricing && pricing.pricingType
          ? billingUnitForPricingType(pricing.pricingType)
          : null,
      currency: hasPricing ? 'USD' : null,
      inputSchema: schemas.input,
      mappingStatus: supported ? 'supported' : 'quarantined',
      observed,
      openapi,
      openapiVersion:
        typeof openapi.openapi === 'string' ? openapi.openapi : null,
      outputSchema: schemas.output,
      pricing: pricingSnapshot,
      pricingType: observed
        ? observed.selectorKeys.length === 0 && observed.rates.length === 1
          ? 'flat'
          : 'conditional'
        : hasCuratedPricing
          ? pricing.pricingType
          : null,
      schemaFamily,
      unitPrice: single
        ? String(single.unitPriceUsd)
        : observed
          ? null
          : hasCuratedPricing
            ? String(pricing.unitPriceUsd)
            : null,
      unitPriceMicros: single
        ? BigInt(Math.round(single.unitPriceUsd * 1_000_000))
        : observed
          ? null
          : hasCuratedPricing
            ? BigInt(Math.round((pricing.unitPriceUsd as number) * 1_000_000))
            : null,
      unsupportedReason,
      version: hashReplicateProviderContract(candidateWithoutVersion),
    };
  }

  /** Map the page's billing tiers onto this model's own input fields. */
  private observeRates(
    billing: ReplicateBillingObservation | undefined,
    inputSchema: Record<string, unknown>,
  ): { billingFailure: string | null; observed: ObservedRates | null } {
    if (!billing)
      return { billingFailure: 'no_billing_observation', observed: null };
    if (billing.status === 'unavailable')
      return { billingFailure: billing.reason, observed: null };
    const properties = isRecord(inputSchema.properties)
      ? inputSchema.properties
      : {};
    const mapping = mapReplicateBillingTiers(billing.tiers, properties);
    if (mapping.status === 'failed')
      return { billingFailure: mapping.reason, observed: null };
    const priced = new Set(mapping.selectorKeys);
    return {
      billingFailure: null,
      observed: {
        // Schema selectors the tiers do not price on never change the price.
        invariantSelectors: deriveRequiredSelectorKeys(properties).filter(
          (key) => !priced.has(key),
        ),
        rates: mapping.rates,
        selectorKeys: mapping.selectorKeys,
        sourceUrl: billing.sourceUrl,
      },
    };
  }
}
