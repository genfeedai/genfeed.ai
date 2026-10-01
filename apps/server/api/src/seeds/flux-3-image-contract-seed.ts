import openapi from '@api/services/prompt-builder/builders/replicate/fixtures/flux-3-image.schema.json';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelProvider } from '@genfeedai/contracts';
import {
  FLUX_3_EDIT_CONTRACT_VERSION,
  FLUX_3_IMAGE_CONTRACT_VERSION,
  FLUX_3_PROVIDER_COSTS,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';

/** Reviewed, dated provider evidence. Never refresh the verification date on restart. */
export async function seedFlux3ImageContract(
  prisma: PrismaService,
  modelId: string,
  modelKey: string,
): Promise<void> {
  const model = await prisma.model.findUnique({
    where: { id: modelId },
    select: {
      reviewedProviderContractVersion: true,
      pendingProviderContractVersion: true,
    },
  });
  // Operator-reviewed contracts and pending drift retain their admission gates.
  if (
    !model ||
    model.reviewedProviderContractVersion ||
    model.pendingProviderContractVersion
  )
    return;
  const endpoint = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE;
  const version =
    modelKey === MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT
      ? FLUX_3_EDIT_CONTRACT_VERSION
      : FLUX_3_IMAGE_CONTRACT_VERSION;
  const verifiedAt = '2026-10-01T00:00:00.000Z';
  const inputSchema = openapi.components.schemas.Input;
  const pricing = {
    currency: 'USD',
    source: 'provider-model-page',
    sourceUrl: `https://replicate.com/${endpoint}`,
    verifiedAt,
    rates: Object.entries(FLUX_3_PROVIDER_COSTS).map(
      ([resolution, unitPriceUsd]) => ({
        component: 'output',
        unit: 'output',
        unitPriceUsd,
        when: { resolution },
      }),
    ),
  };
  await prisma.modelProviderContract.upsert({
    where: {
      provider_endpoint_version: {
        provider: ModelProvider.REPLICATE,
        endpoint,
        version,
      },
    },
    create: {
      modelId,
      provider: ModelProvider.REPLICATE,
      endpoint,
      version,
      schemaFamily: 'flux-3-image-v1',
      mappingStatus: 'supported',
      reviewStatus: 'approved',
      inputSchema: inputSchema as Prisma.InputJsonValue,
      outputSchema: openapi.components.schemas.Output as Prisma.InputJsonValue,
      openapi: openapi as Prisma.InputJsonValue,
      openapiVersion: openapi.openapi,
      pricingType: 'conditional',
      currency: 'USD',
      billingUnit: 'output',
      unitPrice: '0.024',
      unitPriceMicros: 24000,
      pricing,
      conditionalDimensions: { resolution: Object.keys(FLUX_3_PROVIDER_COSTS) },
      discoveredAt: new Date(verifiedAt),
      lastSeenAt: new Date(verifiedAt),
    },
    update: {},
  });
  await prisma.model.updateMany({
    where: {
      id: modelId,
      reviewedProviderContractVersion: null,
      pendingProviderContractVersion: null,
    },
    data: {
      endpoint,
      providerInputSchema: inputSchema as Prisma.InputJsonValue,
      providerSchemaFamily: 'flux-3-image-v1',
      reviewedProviderContractVersion: version,
      reviewStatus: 'approved',
      providerSyncStatus: 'fresh',
    },
  });
}
