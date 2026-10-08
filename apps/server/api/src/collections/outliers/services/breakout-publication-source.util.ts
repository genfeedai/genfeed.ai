import { loadNativeSourceExposurePublication } from '@api/collections/outliers/services/native-source-exposure-observation.util';
import { loadPostExposurePublication } from '@api/collections/outliers/services/post-exposure-observation.util';
import type {
  BreakoutPublicationReference,
  BreakoutPublicationSource,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

export async function loadBreakoutPublication(
  tx: Prisma.TransactionClient,
  reference: Readonly<BreakoutPublicationReference>,
): Promise<BreakoutPublicationSource | null> {
  if (reference.postId && !reference.nativeSourcePostId)
    return loadPostExposurePublication(tx, {
      organizationId: reference.organizationId,
      brandId: reference.brandId,
      credentialId: reference.credentialId,
      platform: reference.platform,
      externalId: reference.externalId,
      postId: reference.postId,
    });
  if (reference.nativeSourcePostId && !reference.postId)
    return loadNativeSourceExposurePublication(tx, reference);
  return null;
}
export function breakoutPublicationId(
  source: Readonly<BreakoutPublicationSource>,
): string {
  return 'postId' in source ? source.postId : source.sourcePostId;
}
