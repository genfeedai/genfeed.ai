import type { ReviewedReplicateOutputContractResult } from '@api/collections/models/utils/model-provider-output-contract.interface';
import { interpretSingleMediaOutputContract } from '@api/collections/models/utils/model-single-media-output-contract.util';
import { resolvePredictionTarget } from '@api/services/integrations/replicate/helpers/replicate-prediction-target.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { platformOrTenantScope } from '@libs/prisma/platform-scope';
import { hashReplicateProviderContract } from '@libs/utils/provider-contract.util';

/** Exact selected catalog row only; pending contracts and unrelated endpoints never authorize dispatch. */
export async function findReviewedReplicateOutputContract(
  prisma: PrismaService,
  modelKey: string,
  providerInput: Readonly<Record<string, unknown>>,
  organizationId?: string,
): Promise<ReviewedReplicateOutputContractResult> {
  // tenant-scope-ignore: exact catalog lookup explicitly permits only the supplied organization or global organizationId:null and excludes soft deletes.
  const model = await prisma.model.findFirst({
    where: {
      key: modelKey,
      isDeleted: false,
      ...platformOrTenantScope(organizationId),
    },
    select: {
      id: true,
      key: true,
      provider: true,
      endpoint: true,
      isActive: true,
      isDeleted: true,
      reviewedProviderContractVersion: true,
      providerContracts: {
        select: {
          modelId: true,
          provider: true,
          endpoint: true,
          version: true,
          reviewStatus: true,
          mappingStatus: true,
          inputSchema: true,
          outputSchema: true,
          openapi: true,
          pricing: true,
          schemaFamily: true,
        },
      },
    },
  });
  if (
    !model ||
    model.key !== modelKey ||
    !model.isActive ||
    model.isDeleted ||
    model.provider !== 'replicate'
  )
    return { status: 'unresolved', reason: 'exact_provider_model_unavailable' };
  const target = resolvePredictionTarget(modelKey);
  // Discovery's endpoint is owner/model, distinct from either snapshot hash or version ID.
  const separator = modelKey.lastIndexOf(':');
  const endpoint =
    'model' in target
      ? target.model
      : separator >= 0
        ? modelKey.slice(0, separator)
        : model.endpoint;
  if (!endpoint || model.endpoint !== endpoint)
    return { status: 'unresolved', reason: 'provider_endpoint_mismatch' };
  const contract = model.providerContracts.find(
    (candidate) =>
      candidate.modelId === model.id &&
      candidate.provider === 'replicate' &&
      candidate.endpoint === endpoint &&
      candidate.version === model.reviewedProviderContractVersion &&
      candidate.reviewStatus === 'approved' &&
      candidate.mappingStatus === 'supported',
  );
  if (!contract || !model.reviewedProviderContractVersion)
    return {
      status: 'unresolved',
      reason: 'reviewed_output_contract_unavailable',
    };
  if (
    'version' in target &&
    hashReplicateProviderContract({
      endpoint,
      inputSchema: contract.inputSchema,
      outputSchema: contract.outputSchema,
      openapi: contract.openapi,
      pricing: contract.pricing,
      schemaFamily: contract.schemaFamily,
      providerVersion: target.version,
    }) !== contract.version
  )
    return { status: 'unresolved', reason: 'provider_version_unverified' };
  const interpreted = interpretSingleMediaOutputContract(
    contract.outputSchema,
    contract.inputSchema,
    providerInput,
  );
  if (interpreted.status === 'unresolved') return interpreted;
  return {
    status: 'reviewed',
    contract: {
      modelKey,
      provider: 'replicate',
      endpoint,
      version: contract.version,
      target,
      output: interpreted.contract,
    },
  };
}
