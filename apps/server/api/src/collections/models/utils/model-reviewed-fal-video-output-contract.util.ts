import { getFalEndpointFromModelKey } from '@api/collections/models/utils/model-key.util';
import type { ReviewedFalVideoOutputContractResult } from '@api/collections/models/utils/model-provider-output-contract.interface';
import { FalSchemaFamily } from '@api/services/integrations/fal/services/fal-contract';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { platformOrTenantScope } from '@libs/prisma/platform-scope';
import { hashProviderContract } from '@libs/utils/provider-contract.util';

const VIDEO_FAMILIES = new Set<string>([
  FalSchemaFamily.VIDEO_TEXT,
  FalSchemaFamily.VIDEO_IMAGE,
  FalSchemaFamily.VIDEO_REFERENCE,
  FalSchemaFamily.VIDEO_DRAFT,
]);
const COMPOSITIONS = [
  '$ref',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
];
function simple(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.nullable !== true &&
    !COMPOSITIONS.some((key) => Object.hasOwn(value, key))
  );
}
function required(schema: Record<string, unknown>, key: string): boolean {
  return Array.isArray(schema.required) && schema.required.includes(key);
}
function singleVideo(schema: unknown): boolean {
  if (
    !simple(schema) ||
    schema.type !== 'object' ||
    !isRecord(schema.properties) ||
    !required(schema, 'video') ||
    Object.hasOwn(schema.properties, 'videos')
  )
    return false;
  const video = schema.properties.video;
  if (
    !simple(video) ||
    video.type !== 'object' ||
    !isRecord(video.properties) ||
    !required(video, 'url')
  )
    return false;
  const url = video.properties.url;
  return (
    simple(url) &&
    url.type === 'string' &&
    (url.format === undefined || url.format === 'uri')
  );
}

/** Reads an approved exact video shape; it neither activates a model nor approves a tariff. */
export async function findReviewedFalVideoOutputContract(
  prisma: PrismaService,
  modelKey: string,
  organizationId?: string,
): Promise<ReviewedFalVideoOutputContractResult> {
  // tenant-scope-ignore: exact catalog key permits only the supplied tenant or organizationId:null, excluding soft deletes.
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
    model.provider !== 'fal'
  )
    return { status: 'unresolved', reason: 'exact_provider_model_unavailable' };
  const endpoint = getFalEndpointFromModelKey(modelKey);
  if (model.endpoint !== endpoint)
    return { status: 'unresolved', reason: 'provider_endpoint_mismatch' };
  const snapshot = model.providerContracts.find(
    (candidate) =>
      candidate.modelId === model.id &&
      candidate.provider === 'fal' &&
      candidate.endpoint === endpoint &&
      candidate.version === model.reviewedProviderContractVersion &&
      candidate.reviewStatus === 'approved' &&
      candidate.mappingStatus === 'supported',
  );
  if (!snapshot || !model.reviewedProviderContractVersion)
    return {
      status: 'unresolved',
      reason: 'reviewed_output_contract_unavailable',
    };
  // Discovery excludes the observation timestamp from its token-pricing preimage.
  const pricing = isRecord(snapshot.pricing)
    ? { ...snapshot.pricing, verifiedAt: undefined }
    : snapshot.pricing;
  if (
    hashProviderContract({
      endpoint,
      inputSchema: snapshot.inputSchema,
      outputSchema: snapshot.outputSchema,
      openapi: snapshot.openapi,
      pricing,
      schemaFamily: snapshot.schemaFamily,
    }) !== snapshot.version
  )
    return { status: 'unresolved', reason: 'provider_snapshot_unverified' };
  if (
    !snapshot.schemaFamily ||
    !VIDEO_FAMILIES.has(snapshot.schemaFamily) ||
    !simple(snapshot.inputSchema) ||
    snapshot.inputSchema.type !== 'object' ||
    !singleVideo(snapshot.outputSchema)
  )
    return { status: 'unresolved', reason: 'unsupported_video_output_schema' };
  return {
    status: 'reviewed',
    inputSchema: snapshot.inputSchema,
    schemaFamily: snapshot.schemaFamily,
    contract: {
      modelKey,
      provider: 'fal',
      endpoint,
      version: snapshot.version,
      target: { endpoint },
      output: {
        adapterVersion: 1,
        representation: 'video-object',
        requests: 1,
        outputs: 1,
      },
    },
  };
}
