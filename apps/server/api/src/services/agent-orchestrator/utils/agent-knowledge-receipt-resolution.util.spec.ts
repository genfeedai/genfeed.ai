import {
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { KnowledgeReceipt } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';
import { resolveAgentKnowledgeReceipts } from './agent-knowledge-receipt-resolution.util';

function receipt(): KnowledgeReceipt {
  return {
    excerpt: 'Retrieved evidence',
    kind: KnowledgeSourceKind.TEXT,
    purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
    relevance: 0.9,
    sourceId: 'source-1',
    title: 'Recorded fact',
    version: 1,
    versionId: 'version-1',
  };
}

function passages(count: number): Map<string, KnowledgeReceipt> {
  return new Map(
    Array.from({ length: count }, (_, i) => [`passage-${i}`, receipt()]),
  );
}

function deferredReceipt() {
  let resolve!: (value: KnowledgeReceipt | null) => void;
  const promise = new Promise<KnowledgeReceipt | null>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('resolveAgentKnowledgeReceipts', () => {
  it('preserves positions and validates duplicate references only once', async () => {
    const updated = {
      ...receipt(),
      excerpt: 'Current safe excerpt',
      title: 'Current title',
      url: '/current',
    };
    const revalidate = vi.fn(async () => updated);
    expect(
      await resolveAgentKnowledgeReceipts(
        ['passage-0', 'invented', 'passage-0'],
        passages(1),
        revalidate,
      ),
    ).toEqual([updated, null, updated]);
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledWith('passage-0', receipt());
  });

  it('never validates invented, other-turn, malformed or oversized requested IDs', async () => {
    const revalidate = vi.fn(async () => receipt());
    const ids = [
      'invented',
      'prior-turn',
      '',
      ' passage-0',
      'passage-0 ',
      'PASSAGE-0',
      '../passage-0',
      'é',
      'a'.repeat(129),
      'passage-0\n',
    ];
    expect(
      await resolveAgentKnowledgeReceipts(ids, passages(1), revalidate),
    ).toEqual(ids.map(() => null));
    expect(revalidate).not.toHaveBeenCalled();
  });

  it.each(['stale', 'purged', 'no-longer-authorized'])(
    'rejects %s evidence and caches duplicate rejection',
    async () => {
      const revalidate = vi.fn(async () => null);
      expect(
        await resolveAgentKnowledgeReceipts(
          ['passage-0', 'passage-0'],
          passages(1),
          revalidate,
        ),
      ).toEqual([null, null]);
      expect(revalidate).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { sourceId: 'replacement-source' },
    { versionId: 'replacement-version' },
    { version: 2 },
  ])('rejects replacement retrieved identity %j', async (changed) => {
    expect(
      await resolveAgentKnowledgeReceipts(
        ['passage-0'],
        passages(1),
        async () => ({ ...receipt(), ...changed }),
      ),
    ).toEqual([null]);
  });

  it('revalidates again across turns rather than caching prior eligibility', async () => {
    const map = new Map([['A', receipt()]]);
    const revalidate = vi
      .fn<
        (
          id: string,
          value: Readonly<KnowledgeReceipt>,
        ) => Promise<KnowledgeReceipt | null>
      >()
      .mockResolvedValueOnce(receipt())
      .mockResolvedValueOnce(null);
    expect(await resolveAgentKnowledgeReceipts(['A'], map, revalidate)).toEqual(
      [receipt()],
    );
    expect(await resolveAgentKnowledgeReceipts(['A'], map, revalidate)).toEqual(
      [null],
    );
    expect(revalidate).toHaveBeenCalledTimes(2);
  });

  it('returns current safe fields authorized by revalidation', async () => {
    const updated = {
      ...receipt(),
      excerpt: 'Safe current text',
      mediaUrl: '/media',
      purpose: KnowledgeSourcePurpose.RESEARCH,
      relevance: 0.5,
      startMs: 10,
      endMs: 20,
      title: 'Updated',
      url: '/source',
    };
    const [resolved] = await resolveAgentKnowledgeReceipts(
      ['passage-0'],
      passages(1),
      async () => updated,
    );
    expect(resolved).toBe(updated);
  });

  it('accepts exact request, map and ASCII ID boundaries', async () => {
    const map = passages(511);
    const id = `A_${'z'.repeat(125)}-`;
    map.set(id, receipt());
    const revalidate = vi.fn(async () => receipt());
    const result = await resolveAgentKnowledgeReceipts(
      Array.from({ length: 128 }, () => id),
      map,
      revalidate,
    );
    expect(result).toEqual(Array.from({ length: 128 }, () => receipt()));
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it('bounds 128 distinct validations without truncating results', async () => {
    const revalidate = vi.fn(async () => receipt());
    const result = await resolveAgentKnowledgeReceipts(
      [...passages(128).keys()],
      passages(128),
      revalidate,
    );
    expect(result).toHaveLength(128);
    expect(result.every((value) => value !== null)).toBe(true);
    expect(revalidate).toHaveBeenCalledTimes(128);
  });

  it('fails before callbacks on request overflow including duplicates', async () => {
    const revalidate = vi.fn(async () => receipt());
    await expect(
      resolveAgentKnowledgeReceipts(
        Array.from({ length: 129 }, () => 'passage-0'),
        passages(1),
        revalidate,
      ),
    ).rejects.toThrow(
      new RangeError('knowledge_citation_resolution_limit_exceeded'),
    );
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('fails before callbacks on map overflow even for an empty request', async () => {
    const revalidate = vi.fn(async () => receipt());
    await expect(
      resolveAgentKnowledgeReceipts([], passages(513), revalidate),
    ).rejects.toThrow(
      new RangeError('knowledge_citation_resolution_limit_exceeded'),
    );
    expect(revalidate).not.toHaveBeenCalled();
  });

  it.each(['', 'bad/id', 'a'.repeat(129), 'passage-0\n', 'é'])(
    'rejects malformed trusted-map key %j before callbacks',
    async (id) => {
      const map = passages(1);
      map.set(id, receipt());
      const revalidate = vi.fn(async () => receipt());
      await expect(
        resolveAgentKnowledgeReceipts(['passage-0'], map, revalidate),
      ).rejects.toThrow(
        new Error('knowledge_citation_resolution_invalid_input'),
      );
      expect(revalidate).not.toHaveBeenCalled();
      await expect(
        resolveAgentKnowledgeReceipts([], map, revalidate),
      ).rejects.toThrow('knowledge_citation_resolution_invalid_input');
    },
  );

  it('returns empty output without callbacks for valid empty input', async () => {
    const revalidate = vi.fn(async () => receipt());
    expect(
      await resolveAgentKnowledgeReceipts([], passages(512), revalidate),
    ).toEqual([]);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('contains synchronous throws and async rejection and continues other references', async () => {
    const revalidate = vi.fn((id: string): Promise<KnowledgeReceipt | null> => {
      if (id === 'passage-0') throw new Error('SENTINEL_PRIVATE_SYNC');
      if (id === 'passage-1')
        return Promise.reject(new Error('SENTINEL_PRIVATE_ASYNC'));
      return Promise.resolve(receipt());
    });
    const result = await resolveAgentKnowledgeReceipts(
      ['passage-0', 'passage-1', 'passage-0', 'passage-2'],
      passages(3),
      revalidate,
    );
    expect(result).toEqual([null, null, null, receipt()]);
    expect(JSON.stringify(result)).not.toContain('SENTINEL_PRIVATE');
    expect(revalidate).toHaveBeenCalledTimes(3);
  });

  it('revalidates sequentially using deterministic deferred promises', async () => {
    const first = deferredReceipt();
    const second = deferredReceipt();
    const revalidate = vi.fn((id: string) =>
      id === 'passage-0' ? first.promise : second.promise,
    );
    const result = resolveAgentKnowledgeReceipts(
      ['passage-0', 'passage-1', 'passage-0'],
      passages(2),
      revalidate,
    );
    expect(revalidate.mock.calls.map(([id]) => id)).toEqual(['passage-0']);
    first.resolve(receipt());
    await first.promise;
    expect(revalidate.mock.calls.map(([id]) => id)).toEqual([
      'passage-0',
      'passage-1',
    ]);
    second.resolve(null);
    expect(await result).toEqual([receipt(), null, receipt()]);
  });

  it('snapshots the request and all receipts before the first await', async () => {
    const first = deferredReceipt();
    const map = passages(2);
    const original = map.get('passage-1');
    if (!original) throw new Error('fixture_missing');
    const ids = ['passage-0', 'passage-1'];
    const revalidate = vi.fn(
      (id: string, value: Readonly<KnowledgeReceipt>) => {
        expect(Object.isFrozen(value)).toBe(true);
        return id === 'passage-0'
          ? first.promise
          : Promise.resolve({ ...value });
      },
    );
    const result = resolveAgentKnowledgeReceipts(ids, map, revalidate);
    ids[1] = 'invented';
    original.versionId = 'mutated-version';
    original.title = 'Mutated title';
    map.clear();
    first.resolve(receipt());
    expect(await result).toEqual([receipt(), receipt()]);
    expect(revalidate).toHaveBeenNthCalledWith(2, 'passage-1', receipt());
  });

  it('freezes callback copies without freezing or mutating caller inputs', async () => {
    const original = receipt();
    const map = new Map([['passage-0', original]]);
    const ids = ['passage-0'];
    const result = await resolveAgentKnowledgeReceipts(
      ids,
      map,
      async (_id, value) => {
        expect(value).not.toBe(original);
        expect(Object.isFrozen(value)).toBe(true);
        expect(Reflect.set(value, 'versionId', 'forged')).toBe(false);
        return { ...value };
      },
    );
    expect(result).toEqual([receipt()]);
    expect(original).toEqual(receipt());
    expect(Object.isFrozen(original)).toBe(false);
    expect(map.get('passage-0')).toBe(original);
    expect(ids).toEqual(['passage-0']);
  });
});
