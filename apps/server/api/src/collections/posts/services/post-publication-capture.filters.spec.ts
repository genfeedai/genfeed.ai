import {
  extensionPublicationAnalyticsDiscoveryFilter,
  publicYoutubeInboxPostFilter,
} from '@api/collections/posts/services/post-publication-capture.filters';
import { Platform, PostStatus } from '@genfeedai/contracts';
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
it('requires public captured post kind while preserving legacy public YouTube scope', () =>
  expect(
    publicYoutubeInboxPostFilter({ id: 'credential', brandId: 'brand' }),
  ).toEqual({
    brandId: 'brand',
    credentialId: 'credential',
    externalId: { not: null },
    platform: Platform.YOUTUBE,
    status: { in: [PostStatus.PUBLIC] },
    AND: [
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
