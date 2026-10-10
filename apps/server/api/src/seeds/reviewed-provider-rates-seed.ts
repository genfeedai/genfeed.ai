import {
  deriveRequiredSelectorKeys,
  parseContractReviewedPricing,
} from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { HEYGEN_SCHEMA_FIXTURES } from '@api/seeds/fixtures/heygen-rate-schemas';
import type { SchemaFixture } from '@api/seeds/reviewed-provider-rates-seed.types';
import flux3Openapi from '@api/services/prompt-builder/builders/replicate/fixtures/flux-3-image.schema.json';
import ideogramOpenapi from '@api/services/prompt-builder/builders/replicate/fixtures/ideogram-4-5.schema.json';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelProvider } from '@genfeedai/contracts';
import {
  hashReviewedRateSheetEntry,
  REVIEWED_RATE_SHEET_ENTRIES,
  type ReviewedRateSheetEntry,
} from '@genfeedai/pricing';
import type { Prisma } from '@genfeedai/prisma';

export interface RateSeedLogger {
  warn(message: string): void;
}

/** Marks a contract the sheet wrote, as opposed to one an operator approved. */
export const RATE_SHEET_REVIEWER = 'rate-sheet';

/** Input schemas the pre-sheet seeds shipped, for rows that have none yet. */
const SCHEMA_FIXTURES: Readonly<Record<string, SchemaFixture>> = {
  'black-forest-labs/flux-3-image': {
    openapi: flux3Openapi,
    schemaFamily: 'flux-3-image-v1',
  },
  'black-forest-labs/flux-3-image-edit': {
    openapi: flux3Openapi,
    schemaFamily: 'flux-3-image-v1',
  },
  'ideogram-ai/ideogram-4-5': {
    openapi: ideogramOpenapi,
    schemaFamily: 'ideogram-image-edit-v1',
  },
  ...HEYGEN_SCHEMA_FIXTURES,
};

function conditionalDimensions(
  entry: ReviewedRateSheetEntry,
): Record<string, Array<string | number | boolean>> {
  const dimensions: Record<string, Array<string | number | boolean>> = {};
  for (const rate of entry.rates)
    for (const [key, value] of Object.entries(rate.when)) {
      const values = dimensions[key] ?? [];
      if (!values.includes(value)) values.push(value);
      dimensions[key] = values;
    }
  return dimensions;
}

function isEmptySchema(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'object' && Object.keys(value).length === 0)
  );
}

/**
 * Seed one sheet entry as an approved contract whose version is the rate
 * hash. Idempotent: identical rates leave the row alone. Never overwrites a
 * contract an operator approved at or after the sheet's verification date.
 */
async function seedEntry(
  prisma: PrismaService,
  entry: ReviewedRateSheetEntry,
  logger?: RateSeedLogger,
): Promise<boolean> {
  // tenant-scope-ignore: the rate sheet seeds the platform-wide registry (organizationId null) rows only
  const model = await prisma.model.findFirst({
    select: {
      endpoint: true,
      hasAudioToggle: true,
      hasResolutionOptions: true,
      id: true,
      isFree: true,
      key: true,
      provider: true,
      providerInputSchema: true,
      reviewedProviderContractVersion: true,
    },
    where: {
      isDeleted: false,
      OR: [{ endpoint: entry.endpoint }, { key: entry.endpoint }],
      organizationId: null,
      provider: entry.provider,
    },
  });
  if (!model) return false;

  const endpoint = model.endpoint || entry.endpoint;
  const version = hashReviewedRateSheetEntry(entry);
  if (model.reviewedProviderContractVersion === version) return false;

  if (model.reviewedProviderContractVersion) {
    const reviewed = await prisma.modelProviderContract.findUnique({
      where: {
        provider_endpoint_version: {
          endpoint,
          provider: entry.provider,
          version: model.reviewedProviderContractVersion,
        },
      },
    });
    const parsed = reviewed
      ? parseContractReviewedPricing(
          { endpoint, isFree: model.isFree, provider: entry.provider },
          reviewed,
        )
      : null;
    // The reviewed contract already charges these rates.
    if (parsed && hashReviewedRateSheetEntry(parsed) === version) return false;
    // An operator approved something at or after the sheet's date.
    if (
      reviewed?.reviewedBy &&
      reviewed.reviewedBy !== RATE_SHEET_REVIEWER &&
      reviewed.reviewedAt &&
      reviewed.reviewedAt.getTime() >= Date.parse(entry.verifiedAt)
    )
      return false;
  }

  const fixture = SCHEMA_FIXTURES[entry.endpoint];
  const hasSchema = !isEmptySchema(model.providerInputSchema);
  // A contract is never promoted without an output schema: take it from the
  // shipped fixture, else from the latest provider contract observed for this
  // endpoint. With neither the model stays red.
  const observed = fixture
    ? []
    : await prisma.modelProviderContract.findMany({
        orderBy: { lastSeenAt: 'desc' },
        take: 20,
        where: { endpoint, provider: entry.provider },
      });
  const usableObserved =
    observed.find((candidate) => !isEmptySchema(candidate.outputSchema)) ??
    null;
  const outputSchema = fixture
    ? (fixture.openapi.components.schemas.Output as Prisma.InputJsonValue)
    : (usableObserved?.outputSchema as Prisma.InputJsonValue | undefined);
  if (outputSchema === undefined || isEmptySchema(outputSchema)) {
    await prisma.model.updateMany({
      data: {
        providerSyncFailedAt: new Date(),
        providerSyncFailureCode: 'rates_unavailable:missing output schema',
        providerSyncStatus: 'failed',
      },
      where: { id: model.id, isDeleted: false, organizationId: null },
    });
    logger?.warn(
      `Rate sheet entry ${entry.endpoint} not promoted: missing output schema`,
    );
    return false;
  }
  const inputSchema: Prisma.InputJsonValue = hasSchema
    ? (model.providerInputSchema as Prisma.InputJsonValue)
    : fixture
      ? (fixture.openapi.components.schemas.Input as Prisma.InputJsonValue)
      : !isEmptySchema(usableObserved?.inputSchema)
        ? (usableObserved?.inputSchema as Prisma.InputJsonValue)
        : {};
  const schemaRecord: Record<string, unknown> =
    typeof inputSchema === 'object' &&
    inputSchema !== null &&
    !Array.isArray(inputSchema)
      ? (inputSchema as Record<string, unknown>)
      : {};
  const rawProperties = schemaRecord.properties;
  const properties: Record<string, unknown> =
    typeof rawProperties === 'object' &&
    rawProperties !== null &&
    !Array.isArray(rawProperties)
      ? (rawProperties as Record<string, unknown>)
      : {};
  const priced = new Set(entry.rates.flatMap((rate) => Object.keys(rate.when)));
  const invariantSelectors =
    entry.invariantSelectors ??
    deriveRequiredSelectorKeys(properties, model).filter(
      (key) => !priced.has(key),
    );
  const single = entry.rates.length === 1 ? entry.rates[0] : undefined;
  const verifiedAt = new Date(entry.verifiedAt);

  await prisma.modelProviderContract.upsert({
    create: {
      billingUnit: entry.rates[0]?.unit ?? null,
      conditionalDimensions: conditionalDimensions(
        entry,
      ) as Prisma.InputJsonValue,
      currency: 'USD',
      discoveredAt: verifiedAt,
      endpoint,
      inputSchema,
      lastSeenAt: verifiedAt,
      mappingStatus: 'supported',
      modelId: model.id,
      openapi: (fixture?.openapi ??
        usableObserved?.openapi ??
        {}) as Prisma.InputJsonValue,
      openapiVersion:
        fixture?.openapi.openapi ?? usableObserved?.openapiVersion ?? null,
      outputSchema,
      pricing: {
        currency: 'USD',
        rates: entry.rates,
        ...(entry.variantRules ? { variantRules: entry.variantRules } : {}),
        source: 'provider-model-page',
        sourceUrl: entry.sourceUrl,
        verifiedAt: entry.verifiedAt,
        ...(invariantSelectors.length ? { invariantSelectors } : {}),
      } as unknown as Prisma.InputJsonValue,
      pricingType:
        single && Object.keys(single.when).length === 0
          ? 'flat'
          : 'conditional',
      provider: entry.provider,
      reviewStatus: 'approved',
      reviewedAt: verifiedAt,
      reviewedBy: RATE_SHEET_REVIEWER,
      schemaFamily:
        fixture?.schemaFamily ?? usableObserved?.schemaFamily ?? 'rate-sheet',
      unitPrice: single ? String(single.unitPriceUsd) : null,
      unitPriceMicros: single
        ? BigInt(Math.round(single.unitPriceUsd * 1_000_000))
        : null,
      version,
    },
    update: {},
    where: {
      provider_endpoint_version: {
        endpoint,
        provider: entry.provider,
        version,
      },
    },
  });
  // Compare-and-set on the pointer we read: if an operator approved something
  // since, the sheet does not overwrite it.
  const promoted = await prisma.model.updateMany({
    data: {
      endpoint,
      ...(hasSchema || !fixture
        ? {}
        : {
            providerInputSchema: inputSchema,
            providerSchemaFamily: fixture.schemaFamily,
          }),
      providerSyncStatus: 'fresh',
      reviewedProviderContractVersion: version,
      reviewStatus: 'approved',
    },
    where: {
      id: model.id,
      isDeleted: false,
      organizationId: null,
      reviewedProviderContractVersion: model.reviewedProviderContractVersion,
    },
  });
  if (promoted.count !== 1) {
    logger?.warn(
      `Rate sheet entry ${entry.endpoint} skipped: the reviewed contract changed during seeding`,
    );
    return false;
  }
  return true;
}

/**
 * Seed the checked-in rate sheet (public provider list prices) as approved
 * contracts, replacing the hand-written per-model seeds. Returns how many rows
 * were written.
 */
export async function seedReviewedProviderRates(
  prisma: PrismaService,
  entries: readonly ReviewedRateSheetEntry[] = REVIEWED_RATE_SHEET_ENTRIES,
  logger?: RateSeedLogger,
): Promise<number> {
  let written = 0;
  for (const entry of entries)
    if (
      entry.provider === ModelProvider.REPLICATE ||
      entry.provider === ModelProvider.FAL ||
      entry.provider === ModelProvider.HEYGEN
    )
      if (await seedEntry(prisma, entry, logger)) written += 1;
  return written;
}
