import { scopedWhere } from '@api/index';
import type {
  VideoStitchLut,
  VideoStitchRequest,
} from '@api/services/video-stitch/video-stitch.types';
import { stitchRequestError } from '@api/services/video-stitch/video-stitch.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { assertStoredObjectKey } from '@libs/security/stored-object-key';

/**
 * The colour LUT the brand grades its finished videos with, when the brand
 * turned it on. A grade that is on but has no stored file fails the stitch
 * instead of shipping footage the brand meant to grade ungraded.
 */
export async function loadVideoStitchLut(
  prisma: PrismaService,
  request: VideoStitchRequest,
): Promise<VideoStitchLut | undefined> {
  const brand = await prisma.brand.findFirst({
    select: { isLutEnabled: true, lutStorageKey: true },
    where: scopedWhere(request.organizationId, { id: request.brandId }),
  });
  if (!brand?.isLutEnabled) return undefined;
  if (!brand.lutStorageKey) {
    throw stitchRequestError(
      'lut',
      'The brand colour LUT has not been uploaded',
      'Brand colour LUT unavailable',
    );
  }
  return {
    storageKey: assertStoredObjectKey(brand.lutStorageKey, (message) =>
      stitchRequestError('lut', message, 'Brand colour LUT unavailable'),
    ),
  };
}
