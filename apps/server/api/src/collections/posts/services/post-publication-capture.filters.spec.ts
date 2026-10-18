import {
  extensionPublicationAnalyticsDiscoveryFilter,
  OWNED_INBOX_POST_ORDER_BY,
  ownedPublicInboxPostFilter,
  publicYoutubeInboxPostFilter,
  publishedInboxPostStateFilter,
} from '@api/collections/posts/services/post-publication-capture.filters';
import {
  Platform,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { expect, it } from 'vitest';

const legacy = [
  { source: null },
  { source: { not: 'extension' } },
  {
    targetSettings: {
      path: ['extensionCapture', 'version'],
      equals: Prisma.AnyNull,
    },
  },
  { targetSettings: { path: ['extensionCapture', 'version'], not: 1 } },
];
it('preserves the exact pre-pagination analytics capture fence', () =>
  expect(extensionPublicationAnalyticsDiscoveryFilter()).toEqual({
    OR: [...legacy, { isAnalyticsEnabled: true }],
  }));
it('includes owned published YouTube posts while preserving credential and capture scope', () =>
  expect(
    publicYoutubeInboxPostFilter({ id: 'credential', brandId: 'brand' }),
  ).toEqual({
    brandId: 'brand',
    credentialId: 'credential',
    externalId: { not: null },
    platform: Platform.YOUTUBE,
    AND: [
      publishedInboxPostStateFilter([
        PostStatus.PUBLIC,
        PostStatus.UNLISTED,
        PostStatus.PRIVATE,
      ]),
      {
        OR: [
          ...legacy,
          {
            visibility: 'public',
            targetSettings: {
              path: ['extensionCapture', 'publicationKind'],
              equals: 'post',
            },
          },
        ],
      },
    ],
  }));
it('keeps optional brand undefined without changing the credential predicate', () =>
  expect(
    publicYoutubeInboxPostFilter({ id: 'credential', brandId: null }),
  ).toMatchObject({
    brandId: undefined,
    credentialId: 'credential',
  }));
it('accepts lifecycle-published rows whose legacy status is still the draft default', () =>
  expect(publishedInboxPostStateFilter([PostStatus.PUBLIC])).toEqual({
    OR: [
      { targetExecutionState: TargetExecutionState.PUBLISHED },
      { status: { in: [PostStatus.PUBLIC] } },
    ],
  }));
it('does not admit unpublished rows through the legacy status branch', () => {
  const filter = publishedInboxPostStateFilter([
    PostStatus.PUBLIC,
    PostStatus.UNLISTED,
    PostStatus.PRIVATE,
  ]);
  expect(JSON.stringify(filter)).not.toContain(PostStatus.DRAFT);
  expect(JSON.stringify(filter)).not.toContain(PostStatus.SCHEDULED);
  expect(JSON.stringify(filter)).not.toContain(PostStatus.FAILED);
});
it('orders by publish time with nulls last so lifecycle rows keep newest-first', () =>
  expect(OWNED_INBOX_POST_ORDER_BY).toEqual([
    { publishedAt: { nulls: 'last', sort: 'desc' } },
    { publicationDate: { nulls: 'last', sort: 'desc' } },
    { createdAt: 'desc' },
  ]));
it('scopes owned public inbox posts to the credential and accepts lifecycle-published rows', () =>
  expect(
    ownedPublicInboxPostFilter(Platform.TWITTER, 'credential', null),
  ).toEqual({
    brandId: undefined,
    credentialId: 'credential',
    externalId: { not: null },
    platform: Platform.TWITTER,
    AND: [publishedInboxPostStateFilter([PostStatus.PUBLIC])],
  }));
