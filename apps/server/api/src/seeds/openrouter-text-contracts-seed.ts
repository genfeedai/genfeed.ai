import {
  OPENROUTER_TEXT_CONTRACT_FAMILY,
  type OpenRouterTextSnapshot,
  openrouterTextSnapshotSchema,
} from '@api/collections/models/utils/openrouter-text-contract.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { platformTenantProof } from '@libs/prisma/platform-scope';

/** Marks a contract this seed wrote, as opposed to one an operator approved. */
export const OPENROUTER_TEXT_CONTRACT_REVIEWER = 'openrouter-text-seed';

export interface OpenRouterTextContractSeedEntry {
  modelKey: string;
  /** ZDR-eligible OpenRouter endpoint tag that every request is pinned to. */
  endpointSlug: string;
  contextLength: number;
  maximumCompletionTokens: number;
  reasoning: 'disabled' | 'included-in-output-limit';
  inputUsdPerMillionCeiling: number;
  completionUsdPerMillionCeiling: number;
  requestUsdCeiling: number;
  sourceUrls: readonly string[];
  /** When the provider facts below were read from OpenRouter. */
  observedAt: string;
  /** When the ceilings were approved. An operator approval at or after it wins. */
  reviewedAt: string;
}

/**
 * Code-owned OpenRouter text tariffs. Ceilings bound the price of the whole
 * admitted context and output range; the margin is added at quote time.
 */
export const OPENROUTER_TEXT_CONTRACT_SEED: readonly OpenRouterTextContractSeedEntry[] =
  [
    {
      // Pinned to the healthy ZDR endpoint ($0.75 in / $3.75 out per million);
      // the ceilings are the dearest ZDR endpoint, google-vertex/us.
      completionUsdPerMillionCeiling: 4.125,
      contextLength: 1_048_576,
      endpointSlug: 'google-vertex/global',
      inputUsdPerMillionCeiling: 0.825,
      maximumCompletionTokens: 65_536,
      modelKey: MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_3_8_FLASH,
      observedAt: '2026-10-26T00:00:00.000Z',
      reasoning: 'included-in-output-limit',
      requestUsdCeiling: 0,
      reviewedAt: '2026-10-26T00:00:00.000Z',
      sourceUrls: [
        'https://openrouter.ai/google/gemini-3.8-flash',
        'https://openrouter.ai/api/v1/models/google/gemini-3.8-flash/endpoints',
        'https://openrouter.ai/api/v1/endpoints/zdr',
      ],
    },
  ];

export function buildOpenRouterTextSnapshot(
  entry: OpenRouterTextContractSeedEntry,
  modelId: string,
): OpenRouterTextSnapshot {
  return openrouterTextSnapshotSchema.parse({
    conditionalDimensions: {},
    billingUnit: null,
    currency: null,
    endpoint: entry.modelKey,
    inputSchema: {
      completionCount: 1,
      contextCompression: 'disabled',
      contextOverflow: 'reject',
      fallback: 'disabled',
      kind: 'genfeed-openrouter-text-input',
      messageRoles: ['system', 'user'],
      modalities: 'text-only',
      optionalChargedFeatures: 'disabled',
      outputLimitAccounting: 'all-billable-completion-tokens',
      outputLimitParameter: 'max_tokens',
      reasoning: entry.reasoning,
      retention: { dataCollection: 'deny', zdr: true },
      version: 1,
    },
    kind: 'genfeed-model-provider-contract',
    modelId,
    openapi: {
      adapter: 'openrouter-context-ceiling-v1',
      catalogProvider: 'openrouter',
      contextLength: entry.contextLength,
      endpointSelection: 'exact',
      endpointSlug: entry.endpointSlug,
      kind: 'genfeed-openrouter-text-contract',
      maximumCompletionTokens: entry.maximumCompletionTokens,
      modelId,
      modelKey: entry.modelKey,
      observedAt: entry.observedAt,
      sourceUrls: [...entry.sourceUrls],
      transportProvider: 'openrouter',
      version: 1,
    },
    openapiVersion: null,
    outputSchema: {
      costAccounting: 'reported-account-cost-usd',
      kind: 'genfeed-openrouter-text-output',
      responseKind: 'single-text-completion',
      responseModelKey: entry.modelKey,
      tokenAccounting: 'native',
      version: 1,
    },
    pricing: {
      completionUsdPerMillionCeiling: entry.completionUsdPerMillionCeiling,
      coverage: 'entire-admitted-context-and-output-range',
      currency: 'USD',
      includesApplicableCacheAndTierCharges: true,
      inputUsdPerMillionCeiling: entry.inputUsdPerMillionCeiling,
      kind: 'bounded',
      requestUsdCeiling: entry.requestUsdCeiling,
      unboundedComponents: false,
      version: 1,
    },
    pricingType: null,
    provider: 'openrouter',
    schemaFamily: OPENROUTER_TEXT_CONTRACT_FAMILY,
    unitPrice: null,
    unitPriceMicros: null,
    version: 1,
  });
}

/**
 * Approve one text tariff for the platform model row. Idempotent: an already
 * reviewed identical contract leaves the row alone. Never replaces a contract
 * an operator approved at or after the entry's review date.
 */
async function seedEntry(
  prisma: PrismaService,
  entry: OpenRouterTextContractSeedEntry,
): Promise<boolean> {
  // tenant-scope-ignore: seeds the platform-wide registry (organizationId null) row only; platformTenantProof() tells the CLOUD guard whose request this is
  const model = await prisma.model.findFirst({
    select: { id: true, reviewedProviderContractVersion: true },
    where: {
      AND: platformTenantProof(),
      endpoint: entry.modelKey,
      isDeleted: false,
      key: entry.modelKey,
      organizationId: null,
      provider: 'openrouter',
    },
  });
  if (!model) return false;

  const snapshot = buildOpenRouterTextSnapshot(entry, model.id);
  const version = quoteSnapshotHash(snapshot);
  if (model.reviewedProviderContractVersion === version) return false;

  if (model.reviewedProviderContractVersion) {
    const current = await prisma.modelProviderContract.findUnique({
      where: {
        provider_endpoint_version: {
          endpoint: entry.modelKey,
          provider: 'openrouter',
          version: model.reviewedProviderContractVersion,
        },
      },
    });
    if (
      current?.reviewedBy &&
      current.reviewedBy !== OPENROUTER_TEXT_CONTRACT_REVIEWER &&
      current.reviewedAt &&
      current.reviewedAt.getTime() >= Date.parse(entry.reviewedAt)
    )
      return false;
  }

  const reviewedAt = new Date(entry.reviewedAt);
  await prisma.modelProviderContract.upsert({
    create: {
      billingUnit: null,
      conditionalDimensions: {},
      currency: null,
      discoveredAt: reviewedAt,
      endpoint: entry.modelKey,
      inputSchema: snapshot.inputSchema as Prisma.InputJsonValue,
      lastSeenAt: reviewedAt,
      mappingStatus: 'supported',
      modelId: model.id,
      openapi: snapshot.openapi as Prisma.InputJsonValue,
      openapiVersion: null,
      outputSchema: snapshot.outputSchema as Prisma.InputJsonValue,
      pricing: snapshot.pricing as Prisma.InputJsonValue,
      pricingType: null,
      provider: 'openrouter',
      reviewStatus: 'approved',
      reviewedAt,
      reviewedBy: OPENROUTER_TEXT_CONTRACT_REVIEWER,
      schemaFamily: OPENROUTER_TEXT_CONTRACT_FAMILY,
      unitPrice: null,
      unitPriceMicros: null,
      version,
    },
    update: {},
    where: {
      provider_endpoint_version: {
        endpoint: entry.modelKey,
        provider: 'openrouter',
        version,
      },
    },
  });
  // Compare-and-set on the pointer we read: if an operator approved something
  // since, the seed does not overwrite it.
  const promoted = await prisma.model.updateMany({
    data: { reviewedProviderContractVersion: version },
    where: {
      AND: platformTenantProof(),
      id: model.id,
      isDeleted: false,
      organizationId: null,
      reviewedProviderContractVersion: model.reviewedProviderContractVersion,
    },
  });
  return promoted.count === 1;
}

/** Approve the checked-in OpenRouter text tariffs. Returns how many rows changed. */
export async function seedOpenRouterTextContracts(
  prisma: PrismaService,
  entries: readonly OpenRouterTextContractSeedEntry[] = OPENROUTER_TEXT_CONTRACT_SEED,
): Promise<number> {
  let written = 0;
  for (const entry of entries) if (await seedEntry(prisma, entry)) written += 1;
  return written;
}
