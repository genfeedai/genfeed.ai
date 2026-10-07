import { getProviderModelKey } from '@api/collections/models/utils/model-key.util';
import type { Prisma, PrismaClient } from '@genfeedai/prisma';
import {
  type ProviderModelImportObservation,
  providerModelCapabilities,
} from '@workers/maintenance/provider-model-import';

/** Global registry import: never overwrites a reviewed runtime projection. */
export async function persistProviderModel(
  prisma: PrismaClient,
  observation: ProviderModelImportObservation,
  now = new Date(),
): Promise<{ created: boolean; modelId: string; version: string }> {
  return prisma.$transaction(
    async (tx) => {
      const { contract, endpoint, provider } = observation;
      const key = getProviderModelKey(provider, endpoint);
      // tenant-scope-ignore: inspect unique identities to reject deleted/tenant-owned collisions, never mutate them
      const collisions = await tx.model.findMany({
        where: { OR: [{ provider, endpoint }, { key }] },
      });
      let model = collisions.find(
        (row) => row.provider === provider && row.endpoint === endpoint,
      );
      if (
        collisions.some(
          (row) =>
            row.isDeleted ||
            row.organizationId !== null ||
            row.id !== model?.id,
        )
      )
        throw new Error('protected_registry_identity_collision');
      const created = !model;
      if (!model)
        model = await tx.model.create({
          data: {
            ...providerModelCapabilities(
              contract.inputSchema,
              contract.openapi,
            ),
            category: observation.category,
            config: {
              providerConfig: {
                discoverySource: 'benchmark-import',
                endpoint,
                providerUrl: observation.sourceUrl,
                versionId: observation.providerVersion,
              },
            },
            cost: 0,
            description: observation.description,
            discoveredAt: now,
            endpoint,
            isActive: false,
            isDefault: false,
            isDiscovered: true,
            isFree: false,
            isHighlighted: false,
            isPublic: false,
            key,
            label: observation.label,
            organizationId: null,
            provider,
            reviewStatus: 'pending',
          },
        });
      const snapshot = await tx.modelProviderContract.upsert({
        create: {
          billingUnit: contract.billingUnit,
          conditionalDimensions: ('conditionalDimensions' in contract
            ? contract.conditionalDimensions
            : {}) as Prisma.InputJsonValue,
          currency: contract.currency,
          discoveredAt: now,
          endpoint,
          inputSchema: contract.inputSchema as Prisma.InputJsonValue,
          lastSeenAt: now,
          mappingStatus: contract.mappingStatus,
          modelId: model.id,
          openapi: contract.openapi as Prisma.InputJsonValue,
          openapiVersion: contract.openapiVersion,
          outputSchema: contract.outputSchema as Prisma.InputJsonValue,
          pricing: contract.pricing as Prisma.InputJsonValue,
          pricingType: contract.pricingType,
          provider,
          reviewStatus:
            contract.mappingStatus === 'supported' ? 'pending' : 'quarantined',
          schemaFamily: contract.schemaFamily,
          unitPrice: contract.unitPrice,
          unitPriceMicros: contract.unitPriceMicros,
          unsupportedReason: contract.unsupportedReason,
          version: contract.version,
        },
        update: { lastSeenAt: now },
        where: {
          provider_endpoint_version: {
            endpoint,
            provider,
            version: contract.version,
          },
        },
      });
      if (snapshot.modelId !== model.id)
        throw new Error('protected_contract_identity_collision');
      // Reviewed and rejected snapshots keep their decisions. An importer never promotes or clears another pending contract.
      if (
        model.reviewedProviderContractVersion !== contract.version &&
        model.reviewStatus !== 'rejected' &&
        snapshot.reviewStatus !== 'rejected'
      )
        await tx.model.updateMany({
          data: {
            lastSyncedAt: now,
            pendingProviderContractVersion: contract.version,
            providerSchemaSyncedAt: now,
            providerSyncStatus:
              contract.mappingStatus === 'supported'
                ? 'review_required'
                : model.reviewedProviderContractVersion
                  ? 'failed'
                  : 'quarantined',
          },
          where: { id: model.id, organizationId: null, isDeleted: false },
        });
      return { created, modelId: model.id, version: contract.version };
    },
    { isolationLevel: 'Serializable' },
  );
}

export function assertImportDatabaseTarget(
  connectionString: string | undefined,
  expectedTarget: string | undefined,
): string {
  if (!connectionString || !expectedTarget)
    throw new Error('live_import_requires_database_url_and_explicit_target');
  const url = new URL(connectionString);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    `${url.host}${url.pathname}` !== expectedTarget
  )
    throw new Error('database_target_mismatch');
  return connectionString;
}
