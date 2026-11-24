import {
  PostListSerializer,
  PostSerializer,
  PublicPostSerializer,
} from '@serializers/server/content/post.serializer';
import { describe, expect, it } from 'vitest';

const inboxReceipt = {
  externalId: 'v_inbox_url~receipt',
  id: 'post-1',
  platform: 'tiktok',
  publicationDate: null,
  publishedAt: null,
  targetExecutionState: 'published',
  url: null,
};

const livePost = {
  ...inboxReceipt,
  externalId: '7300000000000000000',
  publicationDate: new Date('2026-11-20T10:00:00Z'),
  publishedAt: new Date('2026-11-20T10:00:00Z'),
  url: 'https://www.tiktok.com/@brand/video/7300000000000000000',
};

function attributesOf(document: unknown): Record<string, unknown> {
  const data = (document as { data: { attributes: Record<string, unknown> } })
    .data;
  return data.attributes;
}

describe('post serialization of a TikTok Inbox delivery', () => {
  it.each([
    ['PostSerializer', PostSerializer],
    ['PostListSerializer', PostListSerializer],
  ])('%s flags a published Inbox receipt', (_name, serializer) => {
    const attributes = attributesOf(serializer.serialize(inboxReceipt));

    expect(attributes.isInboxDelivery).toBe(true);
    expect(attributes.targetExecutionState).toBe('published');
  });

  it.each([
    ['PostSerializer', PostSerializer],
    ['PostListSerializer', PostListSerializer],
  ])('%s does not flag a live TikTok post', (_name, serializer) => {
    const attributes = attributesOf(serializer.serialize(livePost));

    expect(attributes.isInboxDelivery).toBe(false);
  });

  it('does not flag a draft or another platform', () => {
    expect(
      attributesOf(
        PostSerializer.serialize({
          ...inboxReceipt,
          targetExecutionState: 'draft',
        }),
      ).isInboxDelivery,
    ).toBe(false);
    expect(
      attributesOf(
        PostSerializer.serialize({ ...inboxReceipt, platform: 'instagram' }),
      ).isInboxDelivery,
    ).toBe(false);
  });

  it('flags every row of a serialized collection on its own', () => {
    const document = PostListSerializer.serialize([
      inboxReceipt,
      { ...livePost, id: 'post-2' },
    ]) as { data: Array<{ attributes: Record<string, unknown> }> };

    expect(document.data.map((row) => row.attributes.isInboxDelivery)).toEqual([
      true,
      false,
    ]);
  });

  it('keeps the flag out of public post responses', () => {
    expect(
      attributesOf(PublicPostSerializer.serialize(livePost)),
    ).not.toHaveProperty('isInboxDelivery');
  });
});
