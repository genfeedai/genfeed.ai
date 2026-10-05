import {
  deriveRequiredSelectorKeys,
  parseContractReviewedPricing,
} from '@api/collections/models/utils/model-billable-pricing-profile.util';
import flux3Openapi from '@api/services/prompt-builder/builders/replicate/fixtures/flux-3-image.schema.json';
import ideogramOpenapi from '@api/services/prompt-builder/builders/replicate/fixtures/ideogram-4-5.schema.json';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelProvider } from '@genfeedai/contracts';
import {
  hashReviewedProviderRates,
  REVIEWED_RATE_SHEET_ENTRIES,
  type ReviewedRateSheetEntry,
} from '@genfeedai/pricing';
import type { Prisma } from '@genfeedai/prisma';

/** Marks a contract the sheet wrote, as opposed to one an operator approved. */
export const RATE_SHEET_REVIEWER = 'rate-sheet';

interface SchemaFixture {
  openapi: typeof flux3Openapi | typeof ideogramOpenapi;
  schemaFamily: string;
}

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
  const version = hashReviewedProviderRates(entry.rates);
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
    if (parsed && hashReviewedProviderRates(parsed.rates) === version)
      return false;
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
  const inputSchema: Prisma.InputJsonValue = hasSchema
    ? (model.providerInputSchema as Prisma.InputJsonValue)
    : ((fixture?.openapi.components.schemas.Input as Prisma.InputJsonValue) ??
      {});
  const properties =
    typeof inputSchema === 'object' &&
    inputSchema !== null &&
    !Array.isArray(inputSchema) &&
    typeof inputSchema.properties === 'object' &&
    inputSchema.properties !== null &&
    !Array.isArray(inputSchema.properties)
      ? (inputSchema.properties as Record<string, unknown>)
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
      openapi: (fixture?.openapi ?? {}) as Prisma.InputJsonValue,
      openapiVersion: fixture?.openapi.openapi ?? null,
      outputSchema: (fixture?.openapi.components.schemas.Output ??
        {}) as Prisma.InputJsonValue,
      pricing: {
        currency: 'USD',
        rates: entry.rates,
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
      schemaFamily: fixture?.schemaFamily ?? 'rate-sheet',
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
  await prisma.model.updateMany({
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
    where: { id: model.id, isDeleted: false, organizationId: null },
  });
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
): Promise<number> {
  let written = 0;
  for (const entry of entries)
    if (
      entry.provider === ModelProvider.REPLICATE ||
      entry.provider === ModelProvider.FAL
    )
      if (await seedEntry(prisma, entry)) written += 1;
  return written;
}
