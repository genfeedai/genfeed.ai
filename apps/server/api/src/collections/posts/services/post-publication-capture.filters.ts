import { Platform, PostStatus } from '@genfeedai/contracts';
import { type Credential, Prisma } from '@genfeedai/prisma';

function legacyOrCaptureFilter(
  captureWhere: Prisma.PostWhereInput,
): Prisma.PostWhereInput {
  return {
    OR: [
      { source: null },
      { source: { not: 'extension' } },
      {
        targetSettings: {
          path: ['extensionCapture', 'version'],
          equals: Prisma.AnyNull,
        },
      },
      { targetSettings: { path: ['extensionCapture', 'version'], not: 1 } },
      captureWhere,
    ],
  };
}
export function extensionPublicationAnalyticsDiscoveryFilter(): Prisma.PostWhereInput {
  return legacyOrCaptureFilter({ isAnalyticsEnabled: true });
}
export function publicYoutubeInboxPostFilter(
  credential: Pick<Credential, 'id' | 'brandId'>,
): Prisma.PostWhereInput {
  return {
    brandId: credential.brandId ?? undefined,
    credentialId: credential.id,
    externalId: { not: null },
    platform: Platform.YOUTUBE,
    status: { in: [PostStatus.PUBLIC] },
    AND: [
      legacyOrCaptureFilter({
        visibility: 'public',
        targetSettings: {
          path: ['extensionCapture', 'publicationKind'],
          equals: 'post',
        },
      }),
    ],
  };
}
