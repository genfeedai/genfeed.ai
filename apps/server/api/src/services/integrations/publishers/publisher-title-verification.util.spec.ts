import type {
  ProviderVerificationItem,
  ProviderVerificationPage,
} from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { verifyTitlePublish } from '@api/services/integrations/publishers/publisher-title-verification.util';
import { describe, expect, it, vi } from 'vitest';

const startedAt = new Date('2026-10-03T10:00:00.500Z');
const afterGrace = new Date('2026-10-03T11:00:00Z');

function item(
  overrides: Partial<ProviderVerificationItem> = {},
): ProviderVerificationItem {
  return {
    createdAt: new Date('2026-10-03T10:00:03Z'),
    hasMedia: false,
    id: 'landed',
    isReply: false,
    text: '',
    title: 'Launch notes',
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

describe('verifyTitlePublish', () => {
  it('finds the article with the title created since the attempt began', async () => {
    const found = await verifyTitlePublish(
      startedAt,
      onePage(
        item(),
        item({ id: 'older', createdAt: new Date('2026-10-03T09:00:00Z') }),
        item({ id: 'other', title: 'Another article' }),
      ),
      'Launch notes',
      afterGrace,
    );
    expect(found?.id).toBe('landed');
  });

  it('ignores whitespace differences in the title', async () => {
    const found = await verifyTitlePublish(
      startedAt,
      onePage(item({ title: ' Launch   notes ' })),
      'Launch notes',
      afterGrace,
    );
    expect(found?.id).toBe('landed');
  });

  it('confirms absence only after the whole listing and the grace period', async () => {
    expect(
      await verifyTitlePublish(
        startedAt,
        onePage(item({ title: 'Another article' })),
        'Launch notes',
        afterGrace,
      ),
    ).toBeNull();
  });

  it('stays unknown inside the visibility grace', async () => {
    await expect(
      verifyTitlePublish(
        startedAt,
        onePage(),
        'Launch notes',
        new Date('2026-10-03T10:01:00Z'),
      ),
    ).rejects.toThrow('visibility grace');
  });

  it('stays unknown when two articles carry the title', async () => {
    await expect(
      verifyTitlePublish(
        startedAt,
        onePage(item(), item({ id: 'second' })),
        'Launch notes',
        afterGrace,
      ),
    ).rejects.toThrow('duplicate titles');
  });

  it('stays unknown when a match may predate the attempt', async () => {
    await expect(
      verifyTitlePublish(
        startedAt,
        onePage(item({ createdAt: new Date('2026-10-03T10:00:00.200Z') })),
        'Launch notes',
        afterGrace,
      ),
    ).rejects.toThrow('timing proof');
  });

  it('refuses an empty title', async () => {
    await expect(
      verifyTitlePublish(startedAt, onePage(), '  ', afterGrace),
    ).rejects.toThrow('exact title');
  });

  it('reads later pages and finds a match there', async () => {
    const found = await verifyTitlePublish(
      startedAt,
      reader(
        {
          items: [item({ id: 'a', title: 'Another article' })],
          nextCursor: '2',
        },
        { items: [item()], nextCursor: null },
      ),
      'Launch notes',
      afterGrace,
    );
    expect(found?.id).toBe('landed');
  });

  it('stays unknown when pagination cycles', async () => {
    await expect(
      verifyTitlePublish(
        startedAt,
        reader({ items: [], nextCursor: '2' }, { items: [], nextCursor: '2' }),
        'Launch notes',
        afterGrace,
      ),
    ).rejects.toThrow('incomplete or cyclic');
  });

  it('stays unknown when the listing outgrows the bounded window', async () => {
    const pages = Array.from({ length: 5 }, (_, index) => ({
      items: [],
      nextCursor: String(index + 2),
    }));
    await expect(
      verifyTitlePublish(
        startedAt,
        reader(...pages),
        'Launch notes',
        afterGrace,
      ),
    ).rejects.toThrow('bounded window');
  });
});
