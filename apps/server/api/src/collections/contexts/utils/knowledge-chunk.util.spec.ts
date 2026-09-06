vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { softDeleteKnowledgeChunks } from '@api/collections/contexts/utils/knowledge-chunk.util';
import type { MockSql } from '@api/shared/testing/prisma-mock';

function buildTx(groups: Array<{ contextBaseId: string; count: number }>) {
  const contextEntry = {
    groupBy: vi.fn().mockResolvedValue(
      groups.map((group) => ({
        _count: { _all: group.count },
        contextBaseId: group.contextBaseId,
      })),
    ),
    updateMany: vi.fn().mockResolvedValue({
      count: groups.reduce((sum, group) => sum + group.count, 0),
    }),
  };
  const executeRaw = vi.fn().mockResolvedValue(1);
  return {
    contextEntry,
    executeRaw,
    tx: { $executeRaw: executeRaw, contextEntry },
  };
}

describe('softDeleteKnowledgeChunks', () => {
  it('requires a source or version id', async () => {
    const { tx } = buildTx([]);
    await expect(
      softDeleteKnowledgeChunks(tx as never, 'org-1', {}),
    ).rejects.toThrow('source or version id');
  });

  it('is a no-op when nothing is linked', async () => {
    const { tx, contextEntry, executeRaw } = buildTx([]);
    await expect(
      softDeleteKnowledgeChunks(tx as never, 'org-1', { sourceId: 's' }),
    ).resolves.toBe(0);
    expect(contextEntry.updateMany).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('soft-deletes version chunks and decrements each base by its own count', async () => {
    const { tx, contextEntry, executeRaw } = buildTx([
      { contextBaseId: 'base-a', count: 2 },
      { contextBaseId: 'base-b', count: 5 },
    ]);

    await expect(
      softDeleteKnowledgeChunks(tx as never, 'org-1', { versionId: 'v-1' }),
    ).resolves.toBe(7);

    expect(contextEntry.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        isDeleted: false,
        knowledgeSourceVersionId: 'v-1',
      },
      data: { isDeleted: true },
    });
    expect(executeRaw).toHaveBeenCalledTimes(2);
    const [first, second] = executeRaw.mock.calls.map(
      (call) => call[0] as MockSql,
    );
    expect(first?.sql).toContain('GREATEST(0');
    expect(first?.values).toEqual(
      expect.arrayContaining([2, 'org-1', 'base-a']),
    );
    expect(second?.values).toEqual(
      expect.arrayContaining([5, 'org-1', 'base-b']),
    );
  });
});
