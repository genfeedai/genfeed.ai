import type {
  ProviderMediaVerificationMatch,
  ProviderVerificationItem,
  ProviderVerificationPage,
} from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { verifyMediaPublish } from '@api/services/integrations/publishers/publisher-media-verification.util';
import { describe, expect, it, vi } from 'vitest';

const startedAt = new Date('2026-10-03T10:00:00Z');
const afterGrace = new Date('2026-10-03T11:00:00Z');
const image: ProviderMediaVerificationMatch = {
  mediaCount: 1,
  mediaKind: 'image',
  text: 'Exact caption',
};

function item(
  overrides: Partial<ProviderVerificationItem> = {},
): ProviderVerificationItem {
  return {
    createdAt: new Date('2026-10-03T10:00:03Z'),
    hasMedia: true,
    id: 'landed',
    isReply: false,
    mediaCount: 1,
    mediaKind: 'image',
    text: 'Exact caption',
    ...overrides,
  };
}

function reader(...pages: ProviderVerificationPage[]) {
  const read = vi.fn();
  for (const page of pages) read.mockResolvedValueOnce(page);
  return read;
}

function onePage(...items: ProviderVerificationItem[]) {
  return reader({ items, nextCursor: null });
}

describe('verifyMediaPublish', () => {
  it('finds the post that matches caption and media kind', async () => {
    const found = await verifyMediaPublish(
      startedAt,
      onePage(
        item(),
        item({ id: 'older', createdAt: new Date('2026-10-03T09:00:00Z') }),
      ),
      image,
      afterGrace,
    );
    expect(found?.id).toBe('landed');
  });

  it('ignores line-ending and outer-blank differences in the caption', async () => {
    const found = await verifyMediaPublish(
      startedAt,
      onePage(item({ text: '  Line one\r\nLine two \n' })),
      { ...image, text: 'Line one\nLine two' },
      afterGrace,
    );
    expect(found?.id).toBe('landed');
  });

  it('matches a carousel only with the same number of items', async () => {
    const carousel: ProviderMediaVerificationMatch = {
      mediaCount: 3,
      mediaKind: 'carousel',
      text: 'Exact caption',
    };
    const found = await verifyMediaPublish(
      startedAt,
      onePage(item({ mediaCount: 3, mediaKind: 'carousel' })),
      carousel,
      afterGrace,
    );
    expect(found?.id).toBe('landed');
    await expect(
      verifyMediaPublish(
        startedAt,
        onePage(item({ mediaCount: 2, mediaKind: 'carousel' })),
        carousel,
        afterGrace,
      ),
    ).rejects.toThrow('ambiguous media semantics');
  });

  it('follows pagination to the matching post', async () => {
    const found = await verifyMediaPublish(
      startedAt,
      reader(
        {
          items: [
            item({ id: 'old', createdAt: new Date('2026-10-03T08:00:00Z') }),
          ],
          nextCursor: 'c1',
        },
        { items: [item()], nextCursor: null },
      ),
      image,
      afterGrace,
    );
    expect(found?.id).toBe('landed');
  });

  it('confirms absence only after the full listing and the visibility grace', async () => {
    expect(
      await verifyMediaPublish(startedAt, onePage(), image, afterGrace),
    ).toBeNull();
    await expect(
      verifyMediaPublish(
        startedAt,
        onePage(),
        image,
        new Date('2026-10-03T10:02:00Z'),
      ),
    ).rejects.toThrow('visibility grace');
  });

  it('gives a video longer than an image before it is called absent', async () => {
    const video: ProviderMediaVerificationMatch = {
      ...image,
      mediaKind: 'video',
    };
    await expect(
      verifyMediaPublish(
        startedAt,
        onePage(),
        video,
        new Date('2026-10-03T10:20:00Z'),
      ),
    ).rejects.toThrow('visibility grace');
    expect(
      await verifyMediaPublish(
        startedAt,
        onePage(),
        video,
        new Date('2026-10-03T10:31:00Z'),
      ),
    ).toBeNull();
  });

  it.each([
    [
      'a second matching post',
      [
        item(),
        item({ id: 'second', createdAt: new Date('2026-10-03T10:00:05Z') }),
      ],
      'duplicate captions',
    ],
    [
      'the same caption on another media shape',
      [item({ mediaKind: 'video' })],
      'ambiguous media semantics',
    ],
    [
      'same-kind media with a different caption (possibly a rewritten caption)',
      [item({ text: 'Another caption', id: 'other' })],
      'another caption',
    ],
    [
      'an item without media evidence',
      [item({ mediaKind: undefined })],
      'lacks media evidence',
    ],
  ])('stays unknown on %s', async (_name, items, message) => {
    await expect(
      verifyMediaPublish(startedAt, onePage(...items), image, afterGrace),
    ).rejects.toThrow(message);
  });

  it('stays unknown on a match from the attempt second that may predate it', async () => {
    await expect(
      verifyMediaPublish(
        new Date('2026-10-03T10:00:00.500Z'),
        onePage(
          item({ createdAt: new Date('2026-10-03T10:00:00Z'), id: 'edge' }),
        ),
        image,
        afterGrace,
      ),
    ).rejects.toThrow('ambiguous media semantics');
  });

  it('does not let a different kind with a different caption block absence', async () => {
    expect(
      await verifyMediaPublish(
        startedAt,
        onePage(item({ mediaKind: 'other', text: 'A link share' })),
        image,
        afterGrace,
      ),
    ).toBeNull();
  });

  it('refuses an empty caption, which proves nothing', async () => {
    const read = onePage();
    await expect(
      verifyMediaPublish(
        startedAt,
        read,
        { ...image, text: ' \n ' },
        afterGrace,
      ),
    ).rejects.toThrow('lacks exact caption/media proof');
    expect(read).not.toHaveBeenCalled();
  });

  it('stays unknown on a cyclic or unbounded listing and on a failing read', async () => {
    await expect(
      verifyMediaPublish(
        startedAt,
        reader(
          { items: [], nextCursor: 'same' },
          { items: [], nextCursor: 'same' },
        ),
        image,
        afterGrace,
      ),
    ).rejects.toThrow('incomplete or cyclic');
    const endless = vi.fn().mockImplementation(async (cursor?: string) => ({
      items: [],
      nextCursor: `${cursor ?? ''}x`,
    }));
    await expect(
      verifyMediaPublish(startedAt, endless, image, afterGrace),
    ).rejects.toThrow('bounded window');
    await expect(
      verifyMediaPublish(
        startedAt,
        vi.fn().mockRejectedValue(new Error('provider 503')),
        image,
        afterGrace,
      ),
    ).rejects.toThrow('provider 503');
  });
});
