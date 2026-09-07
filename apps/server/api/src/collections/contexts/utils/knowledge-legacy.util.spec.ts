import {
  captureForBookmark,
  captureForLegacyContextSource,
  isHttpUrl,
  kindForLegacyCategory,
  purposeForBookmarkIntent,
  scopeForBrand,
  titleForBookmark,
} from '@api/collections/contexts/utils/knowledge-legacy.util';
import {
  KnowledgeBaseCategory,
  KnowledgeBaseStatus,
  KnowledgeMemoryScope,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { Bookmark } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';

function bookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    author: 'Ada',
    authorHandle: '@ada',
    brandId: 'brand-1',
    category: 'TWEET',
    content: '  Hook worth stealing  ',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    description: null,
    folderId: null,
    id: 'bookmark-1',
    intent: 'INSPIRATION',
    isDeleted: false,
    mediaUrls: [],
    organizationId: 'org-1',
    platform: 'TWITTER',
    platformData: { metadata: { postId: 'p1' } },
    processedAt: null,
    savedAt: new Date('2026-01-02T00:00:00.000Z'),
    thumbnailUrl: null,
    title: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    url: 'https://x.com/ada/status/1',
    userId: 'user-1',
    ...overrides,
  } as Bookmark;
}

describe('knowledge-legacy.util', () => {
  it('never promotes legacy material to Brand Truth', () => {
    expect(purposeForBookmarkIntent('INSPIRATION')).toBe(
      KnowledgeSourcePurpose.INSPIRATION,
    );
    expect(purposeForBookmarkIntent('VIDEO')).toBe(
      KnowledgeSourcePurpose.INSPIRATION,
    );
    expect(purposeForBookmarkIntent('REPLY')).toBe(
      KnowledgeSourcePurpose.RESEARCH,
    );
  });

  it('maps legacy categories onto canonical kinds and brands onto scope', () => {
    expect(kindForLegacyCategory(KnowledgeBaseCategory.URL)).toBe(
      KnowledgeSourceKind.URL,
    );
    expect(kindForLegacyCategory(KnowledgeBaseCategory.DOCUMENT)).toBe(
      KnowledgeSourceKind.DOCUMENT,
    );
    expect(kindForLegacyCategory(KnowledgeBaseCategory.RSS)).toBe(
      KnowledgeSourceKind.RSS,
    );
    expect(scopeForBrand('brand-1')).toBe(KnowledgeMemoryScope.BRAND);
    expect(scopeForBrand(null)).toBe(KnowledgeMemoryScope.ORG);
  });

  it('accepts only http(s) locations and derives titles from the host', () => {
    expect(isHttpUrl('https://brand.example/pricing')).toBe(true);
    expect(isHttpUrl('ftp://brand.example')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
    expect(
      titleForBookmark({ title: '  Great thread ', url: 'https://x.com/a' }),
    ).toBe('Great thread');
    expect(titleForBookmark({ title: null, url: 'https://x.com/a' })).toBe(
      'x.com',
    );
    expect(titleForBookmark({ title: null, url: 'nope' })).toBe('Saved link');
  });

  it('carries legacy identity and attribution into provenance', () => {
    const capture = captureForBookmark(bookmark());
    expect(capture.payload).toEqual({
      referenceUrl: 'https://x.com/ada/status/1',
      text: 'Hook worth stealing',
    });
    expect(capture.provenance).toMatchObject({
      author: 'Ada',
      authorHandle: '@ada',
      bookmarkId: 'bookmark-1',
      capturedAt: '2026-01-02T00:00:00.000Z',
      capturedBy: 'legacy-bookmark',
      category: 'TWEET',
      intent: 'INSPIRATION',
      platform: 'TWITTER',
      title: 'x.com',
      url: 'https://x.com/ada/status/1',
    });

    const legacy = captureForLegacyContextSource(
      'base-1',
      {
        category: KnowledgeBaseCategory.URL,
        id: 'src_1',
        label: 'Docs',
        lastIngestedAt: '2026-03-01T00:00:00.000Z',
        referenceUrl: 'https://docs.example',
        status: KnowledgeBaseStatus.COMPLETED,
        tags: ['docs'],
      },
      new Date('2026-04-01T00:00:00.000Z'),
    );
    expect(legacy.payload).toEqual({ referenceUrl: 'https://docs.example' });
    expect(legacy.provenance).toEqual({
      capturedAt: '2026-03-01T00:00:00.000Z',
      capturedBy: 'legacy-context-source',
      contextBaseId: 'base-1',
      legacySourceId: 'src_1',
      legacyStatus: 'completed',
      tags: ['docs'],
      title: 'Docs',
      url: 'https://docs.example',
    });
  });
});
