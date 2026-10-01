import openapi from '@api/services/prompt-builder/builders/replicate/fixtures/ideogram-4-5.schema.json';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelProvider } from '@genfeedai/contracts';
import {
  IMAGE_EDIT_CONTRACT_VERSION,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';

/** Reviewed, dated provider evidence. Never refresh the verification date on restart. */
export async function seedImageEditingContract(
  prisma: PrismaService,
  modelId: string,
): Promise<void> {
  const model = await prisma.model.findUnique({
    where: { id: modelId, organizationId: null, isDeleted: false },
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
  const endpoint = MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5;
  const verifiedAt = '2026-10-01T00:00:00.000Z';
  const inputSchema = openapi.components.schemas.Input;
  const pricing = {
    currency: 'USD',
    source: 'provider-model-page',
    sourceUrl: `https://replicate.com/${endpoint}`,
    verifiedAt,
    rates: [
      {
        component: 'edited-image',
        unit: 'output',
        unitPriceUsd: 0.06,
        when: { quality: 'medium' },
      },
    ],
  };
  await prisma.modelProviderContract.upsert({
    where: {
      provider_endpoint_version: {
        provider: ModelProvider.REPLICATE,
        endpoint,
        version: IMAGE_EDIT_CONTRACT_VERSION,
      },
    },
    create: {
      modelId,
      provider: ModelProvider.REPLICATE,
      endpoint,
      version: IMAGE_EDIT_CONTRACT_VERSION,
      schemaFamily: 'ideogram-image-edit-v1',
      mappingStatus: 'supported',
      reviewStatus: 'approved',
      inputSchema: inputSchema as Prisma.InputJsonValue,
      outputSchema: openapi.components.schemas.Output as Prisma.InputJsonValue,
      openapi: openapi as Prisma.InputJsonValue,
      openapiVersion: openapi.openapi,
      pricingType: 'flat',
      currency: 'USD',
      billingUnit: 'output',
      unitPrice: '0.06',
      unitPriceMicros: 60000,
      pricing,
      conditionalDimensions: { quality: ['medium'] },
      discoveredAt: new Date(verifiedAt),
      lastSeenAt: new Date(verifiedAt),
    },
    update: {},
  });
  await prisma.model.updateMany({
    where: {
      id: modelId,
      organizationId: null,
      isDeleted: false,
      reviewedProviderContractVersion: null,
      pendingProviderContractVersion: null,
    },
    data: {
      endpoint,
      providerInputSchema: inputSchema as Prisma.InputJsonValue,
      providerSchemaFamily: 'ideogram-image-edit-v1',
      reviewedProviderContractVersion: IMAGE_EDIT_CONTRACT_VERSION,
      reviewStatus: 'approved',
      providerSyncStatus: 'fresh',
    },
  });
}
