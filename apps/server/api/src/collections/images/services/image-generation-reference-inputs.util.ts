import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { resolveBrandDefaultReferences } from '@api/collections/brands/utils/brand-default-references.util';
import type { BrandGenerationReference } from '@api/collections/brands/utils/brand-kit-generation-references.util';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { ImageGenerationAdmissionService } from '@api/collections/images/services/image-generation-admission.service';
import { isFlux3ImageModel } from '@genfeedai/contracts/constants';
import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces';
import { traced } from '@libs/tracing/traced';

export interface ImageReferenceInputs {
  /** Brand references added because the caller attached none, with roles. */
  brandReferences?: readonly BrandGenerationReference[];
  generationHarness: GenerationHarnessReceipt;
  /** The caller's references, then any brand defaults. */
  referenceIds: string[];
  referenceImageUrls: string[];
}

/**
 * The reference images a request dispatches with. A request that attached
 * nothing gets the brand's own references (style, then product), unless it is
 * an edit, branding is off or the prompt runs raw. The receipt records the
 * attached asset ids, or why a model that accepts none got none.
 */
export const resolveImageReferenceInputs = traced(
  'resolveImageReferenceInputs',
  async (params: {
    admissionService: ImageGenerationAdmissionService;
    brandId: string;
    brandsService: BrandsService;
    createImageDto: CreateImageDto;
    editingSourceUrls?: string[];
    generationHarness: GenerationHarnessReceipt;
    grantedAvatarOwners: ReadonlyMap<string, string>;
    isEditing: boolean;
    model: string;
    organizationId: string;
    referenceIds: string[];
  }): Promise<ImageReferenceInputs> => {
    const { createImageDto, generationHarness, organizationId } = params;
    const defaults =
      params.isEditing ||
      generationHarness.brandMode === 'raw' ||
      createImageDto.brandingMode === 'off' ||
      params.referenceIds.length > 0
        ? undefined
        : resolveBrandDefaultReferences({
            brandKit: await params.brandsService.resolveBrandKitAssets(
              params.brandId,
              organizationId,
            ),
            brandingMode: createImageDto.brandingMode,
            explicitReferenceIds: params.referenceIds,
            modelKey: params.model,
          });
    const attachedAssetIds = defaults?.attachedAssetIds ?? [];
    const referenceIds = [...params.referenceIds, ...attachedAssetIds];

    const referenceImageUrls =
      params.editingSourceUrls ??
      (isFlux3ImageModel(params.model)
        ? await params.admissionService.resolveFlux3References(
            organizationId,
            params.brandId,
            referenceIds,
          )
        : await params.admissionService.resolveReferenceImageUrls(
            organizationId,
            referenceIds,
            params.grantedAvatarOwners,
          ));

    const isRecorded =
      attachedAssetIds.length > 0 || defaults?.skippedReason !== undefined;
    return {
      brandReferences: defaults?.references.length
        ? defaults.references
        : undefined,
      generationHarness: isRecorded
        ? {
            ...generationHarness,
            brandReferences: {
              attachedAssetIds: [...attachedAssetIds],
              ...(defaults?.skippedReason
                ? { skippedReason: defaults.skippedReason }
                : {}),
            },
          }
        : generationHarness,
      referenceIds,
      referenceImageUrls,
    };
  },
);
