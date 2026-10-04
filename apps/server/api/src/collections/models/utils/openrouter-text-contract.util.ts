import {
  OPENROUTER_TEXT_CONTRACT_FAMILY,
  openrouterTextSnapshotSchema,
  type ReviewedOpenRouterTextContract,
} from '@api/collections/models/utils/openrouter-text-contract.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { assertWorkflowCanonicalJson } from '@api/helpers/utils/credits/workflow-media-dispatch-input.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { platformOrTenantScope } from '@libs/prisma/platform-scope';

export type ReviewedOpenRouterTextContractResult =
  | { status: 'reviewed'; contract: ReviewedOpenRouterTextContract }
  | { status: 'unresolved'; reason: string };

/** Private application descriptors only; this reader never promotes or writes a snapshot. */
export async function findReviewedOpenRouterTextContract(
  prisma: PrismaService,
  modelKey: string,
  organizationId?: string,
): Promise<ReviewedOpenRouterTextContractResult> {
  // tenant-scope-ignore: exact catalog lookup permits only supplied organization/global rows and excludes soft deletes.
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
      isFree: true,
      reviewedProviderContractVersion: true,
      providerContracts: {
        select: {
          modelId: true,
          provider: true,
          endpoint: true,
          version: true,
          schemaFamily: true,
          reviewStatus: true,
          mappingStatus: true,
          reviewedAt: true,
          openapiVersion: true,
          openapi: true,
          inputSchema: true,
          outputSchema: true,
          pricing: true,
          currency: true,
          billingUnit: true,
          unitPrice: true,
          unitPriceMicros: true,
          pricingType: true,
          conditionalDimensions: true,
        },
      },
    },
  });
  if (
    !model ||
    model.key !== modelKey ||
    !model.isActive ||
    model.isDeleted ||
    model.endpoint !== modelKey ||
    !model.reviewedProviderContractVersion
  )
    return { status: 'unresolved', reason: 'exact_text_model_unavailable' };
  const matches = model.providerContracts.filter(
    (row) =>
      row.modelId === model.id &&
      row.provider === 'openrouter' &&
      row.endpoint === modelKey &&
      row.version === model.reviewedProviderContractVersion &&
      row.schemaFamily === OPENROUTER_TEXT_CONTRACT_FAMILY &&
      row.reviewStatus === 'approved' &&
      row.mappingStatus === 'supported' &&
      row.reviewedAt !== null,
  );
  if (matches.length !== 1)
    return {
      status: 'unresolved',
      reason: 'reviewed_text_contract_unavailable',
    };
  const {
    version,
    reviewedAt,
    reviewStatus: _review,
    mappingStatus: _mapping,
    ...content
  } = matches[0];
  const parsed = openrouterTextSnapshotSchema.safeParse({
    kind: 'genfeed-model-provider-contract',
    version: 1,
    ...content,
  });
  if (!parsed.success)
    return { status: 'unresolved', reason: 'text_contract_invalid' };
  const snapshot = parsed.data;
  assertWorkflowCanonicalJson(snapshot);
  if (
    snapshot.openapi.catalogProvider !== model.provider ||
    (snapshot.pricing.kind === 'explicit-free' && !model.isFree) ||
    quoteSnapshotHash(snapshot) !== version
  )
    return { status: 'unresolved', reason: 'text_contract_identity_changed' };
  if (!reviewedAt)
    return { status: 'unresolved', reason: 'text_contract_review_missing' };
  return {
    status: 'reviewed',
    contract: { version, reviewedAt: reviewedAt.toISOString(), snapshot },
  };
}
