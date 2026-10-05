import { isFalSchemaFamilyCompatible } from '@api/collections/models/utils/model-schema-family.util';
import { buildCrunContract } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import { CRUN_MODEL_MANIFEST } from '@api/services/integrations/crun/contracts/crun-manifest';
import { isReplicateSchemaFamilyCompatible } from '@api/services/integrations/replicate/services/replicate-contract';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import type {
  CrunInputControls,
  CrunModelInputContract,
} from '@genfeedai/contracts/interfaces';
import { projectCrunInputControls } from '@genfeedai/helpers';
import type {
  ModelProviderContract,
  Model as PrismaModel,
} from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { BadRequestException } from '@nestjs/common';

export function projectReviewedCrunModelInputControls(
  document: Pick<
    PrismaModel,
    'provider' | 'providerInputSchema' | 'reviewedProviderContractVersion'
  >,
): CrunInputControls | undefined {
  if (
    document.provider !== ModelProvider.CRUN ||
    !document.reviewedProviderContractVersion ||
    !isRecord(document.providerInputSchema)
  )
    return undefined;
  const contract = document.providerInputSchema;
  if (
    contract.version !== document.reviewedProviderContractVersion ||
    !isRecord(contract.fields) ||
    typeof contract.endpoint !== 'string' ||
    !['image', 'video'].includes(String(contract.mediaKind)) ||
    (contract.mediaKind === 'video' && !isRecord(contract.videoRules))
  )
    return undefined;
  if (contract.mediaKind === 'video') {
    const rules = contract.videoRules;
    const kling = contract.endpoint === 'kling/v2-5-turbo-pro';
    const veo = contract.endpoint === 'google/veo3-1-fast-t2v';
    if (
      !isRecord(rules) ||
      (!kling && !veo) ||
      rules.referenceMode !== (kling ? 'start-end' : 'none') ||
      rules.omitAspectRatioWithReferences !== kling ||
      JSON.stringify(rules.availableDurations) !==
        JSON.stringify(kling ? [5, 10] : [8])
    )
      return undefined;
  }
  return projectCrunInputControls(
    contract as unknown as CrunModelInputContract,
  );
}

export function validateProviderApprovalAndResolveCrunContract(
  existing: Pick<
    PrismaModel,
    | 'provider'
    | 'endpoint'
    | 'key'
    | 'category'
    | 'pendingProviderContractVersion'
  >,
  pendingContract: ModelProviderContract | null,
  category?: string,
): CrunModelInputContract | undefined {
  const pendingVersion = existing.pendingProviderContractVersion;
  if (
    pendingVersion &&
    (pendingContract?.mappingStatus !== 'supported' ||
      !pendingContract.schemaFamily ||
      !pendingContract.pricingType ||
      (existing.provider !== ModelProvider.CRUN &&
        pendingContract.unitPriceMicros === null))
  ) {
    throw new BadRequestException(
      'The pending provider contract is quarantined and cannot be activated',
    );
  }
  if (
    pendingContract?.schemaFamily &&
    existing.provider === ModelProvider.FAL &&
    !isFalSchemaFamilyCompatible(
      category ?? existing.category,
      pendingContract.schemaFamily,
    )
  ) {
    throw new BadRequestException(
      'The pending provider contract schema family does not match the model category',
    );
  }
  if (
    pendingContract?.schemaFamily &&
    existing.provider === ModelProvider.REPLICATE &&
    !isReplicateSchemaFamilyCompatible(
      category ?? existing.category,
      pendingContract.schemaFamily,
    )
  ) {
    throw new BadRequestException(
      'The pending provider contract schema family does not match the model category',
    );
  }

  let crunContract: CrunModelInputContract | undefined;
  if (pendingContract && existing.provider === ModelProvider.CRUN) {
    const entry = CRUN_MODEL_MANIFEST.find(
      (candidate) =>
        candidate.endpoint === existing.endpoint &&
        candidate.key === existing.key,
    );
    if (
      !entry ||
      pendingContract.schemaFamily !== entry.schemaFamily ||
      (category ?? existing.category) !==
        (entry.mediaKind === 'video'
          ? ModelCategory.VIDEO
          : ModelCategory.IMAGE)
    )
      throw new BadRequestException(
        'The pending Crun contract does not match the exact media route',
      );
    try {
      crunContract = buildCrunContract(
        entry,
        pendingContract.openapi,
        pendingContract.pricing,
      );
    } catch {
      throw new BadRequestException('The pending Crun contract is unsupported');
    }
    if (crunContract.version !== pendingContract.version)
      throw new BadRequestException(
        'The pending Crun contract version is invalid',
      );
  }

  return crunContract;
}

export function crunModelCatalogPatch(
  contract: CrunModelInputContract,
): Pick<
  PrismaModel,
  | 'aspectRatios'
  | 'defaultAspectRatio'
  | 'maxOutputs'
  | 'maxReferences'
  | 'isBatchSupported'
  | 'hasResolutionOptions'
> {
  return {
    aspectRatios:
      contract.fields.aspect_ratio.enum?.filter(
        (value): value is string => typeof value === 'string',
      ) ?? [],
    defaultAspectRatio: String(contract.fields.aspect_ratio.default),
    maxOutputs: 4,
    maxReferences: contract.fields.img_urls?.maxItems ?? 0,
    isBatchSupported: false,
    hasResolutionOptions: Boolean(contract.fields.resolution),
  };
}
