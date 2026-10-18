import {
  Platform,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
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
/**
 * Posts published through the post lifecycle only advance
 * `targetExecutionState` and `visibility`; their legacy `status` column keeps
 * its `draft` default. Rows written before that flow still carry the published
 * state in `status`, so both are accepted.
 */
export function publishedInboxPostStateFilter(
  legacyStatuses: readonly PostStatus[],
): Prisma.PostWhereInput {
  return {
    OR: [
      { targetExecutionState: TargetExecutionState.PUBLISHED },
      { status: { in: [...legacyStatuses] } },
    ],
  };
}

/**
 * Newest first. `publishedAt` can be null (the YouTube completion handler
 * stamps `publicationDate` only), and PostgreSQL sorts nulls first on DESC, so
 * without the fallbacks an older null row could outrank a newer one inside the
 * `take` window.
 */
export const OWNED_INBOX_POST_ORDER_BY: Prisma.PostOrderByWithRelationInput[] =
  [
    { publishedAt: { nulls: 'last', sort: 'desc' } },
    { publicationDate: { nulls: 'last', sort: 'desc' } },
    { createdAt: 'desc' },
  ];

export function ownedPublicInboxPostFilter(
  platform: Platform,
  credentialId: string,
  brandId: string | null | undefined,
): Prisma.PostWhereInput {
  return {
    brandId: brandId ?? undefined,
    credentialId,
    externalId: { not: null },
    platform,
    AND: [publishedInboxPostStateFilter([PostStatus.PUBLIC])],
  };
}

export function publicYoutubeInboxPostFilter(
  credential: Pick<Credential, 'id' | 'brandId'>,
): Prisma.PostWhereInput {
  return {
    brandId: credential.brandId ?? undefined,
    credentialId: credential.id,
    externalId: { not: null },
    platform: Platform.YOUTUBE,
    AND: [
      publishedInboxPostStateFilter([
        PostStatus.PUBLIC,
        PostStatus.UNLISTED,
        PostStatus.PRIVATE,
      ]),
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
