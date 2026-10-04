import {
  LEARNING_DEPENDENCY_WALK_MAX_NODES,
  LearningDependencyService,
} from '@api/collections/content-learning/services/learning-dependency.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ContentLearningDependency, Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const at = new Date('2026-10-01T00:00:00Z');
const CONFIG = 'numeric-nine-v1';
let sequence = 0;
function checkpointEdge(
  derivedId: string,
  sourceId: string,
  overrides: Partial<ContentLearningDependency> = {},
): ContentLearningDependency {
  sequence += 1;
  return {
    id: `edge-${String(sequence).padStart(6, '0')}`,
    isDeleted: false,
    createdAt: at,
    updatedAt: at,
    sourceKind: 'checkpoint',
    sourceOrganizationId: 'org',
    sourceId,
    sourceVersion: '1',
    derivedKind: 'checkpoint',
    derivedOrganizationId: 'org',
    derivedId,
    valid: true,
    invalidatedAt: null,
    ...overrides,
  };
}
function configEdge(derivedId: string): ContentLearningDependency {
  return checkpointEdge(derivedId, CONFIG, {
    sourceKind: 'config',
    sourceOrganizationId: null,
    sourceVersion: CONFIG,
  });
}
function fixture(edges: ContentLearningDependency[]) {
  const findMany = vi.fn(
    async (args: Prisma.ContentLearningDependencyFindManyArgs) => {
      const clauses = (args.where?.OR ??
        []) as Prisma.ContentLearningDependencyWhereInput[];
      return edges
        .filter(
          (edge) =>
            !edge.isDeleted &&
            clauses.some(
              (clause) =>
                clause.derivedKind === edge.derivedKind &&
                clause.derivedOrganizationId === edge.derivedOrganizationId &&
                (clause.derivedId as { in: string[] }).in.includes(
                  edge.derivedId,
                ),
            ),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, args.take);
    },
  );
  const checkpointFindMany = vi.fn(
    async (args: { where: { id: { in: string[] } } }) =>
      args.where.id.in.map((id) => ({ id, revision: 1 })),
  );
  const tx = {
    contentLearningDependency: { findMany },
    contentLearningCheckpoint: { findMany: checkpointFindMany },
  } as unknown as Prisma.TransactionClient;
  // The service's own client must never be used when a tx is supplied.
  const service = new LearningDependencyService({} as PrismaService);
  return { service, tx, findMany, checkpointFindMany };
}

describe('LearningDependencyService level-batched walk', () => {
  // c0 <- c1, c2 ; c1 <- c3 ; c2 <- c3 (shared), c4 ; c3, c4 <- config
  const dag = () => [
    checkpointEdge('c0', 'c1'),
    checkpointEdge('c0', 'c2'),
    checkpointEdge('c1', 'c3'),
    checkpointEdge('c2', 'c3'),
    checkpointEdge('c2', 'c4'),
    configEdge('c3'),
    configEdge('c4'),
  ];

  it('validates a multi-level DAG with shared nodes using one edge query per level', async () => {
    const f = fixture(dag());
    expect(await f.service.valid('checkpoint', 'c0', f.tx, 'org')).toBe(true);
    expect(f.findMany).toHaveBeenCalledTimes(4);
    // levels c0 | c1,c2 | c3,c4 each pin once, plus one revalidation read for
    // the shared c3 re-referenced by c2.
    expect(f.checkpointFindMany).toHaveBeenCalledTimes(4);
  });

  it('keeps edge queries proportional to depth for a wide graph', async () => {
    const edges = [
      ...Array.from({ length: 60 }, (_, index) =>
        checkpointEdge('root', `leaf-${index}`),
      ),
      ...Array.from({ length: 60 }, (_, index) => configEdge(`leaf-${index}`)),
    ];
    const f = fixture(edges);
    expect(await f.service.valid('checkpoint', 'root', f.tx, 'org')).toBe(true);
    expect(f.findMany).toHaveBeenCalledTimes(3);
  });

  it('keeps total queries (edges plus pins) independent of graph width', async () => {
    const total = async (width: number) => {
      const f = fixture([
        ...Array.from({ length: width }, (_, index) =>
          checkpointEdge('root', `leaf-${index}`),
        ),
        ...Array.from({ length: width }, (_, index) =>
          configEdge(`leaf-${index}`),
        ),
      ]);
      expect(await f.service.valid('checkpoint', 'root', f.tx, 'org')).toBe(
        true,
      );
      return (
        f.findMany.mock.calls.length + f.checkpointFindMany.mock.calls.length
      );
    };
    expect(await total(5)).toBe(await total(300));
  });

  it('re-reads a repeated dependency and rejects a version that changed', async () => {
    const f = fixture(dag());
    // c3 is read at level 3 then re-read for the c2 edge; the 2nd read changes.
    let c3Reads = 0;
    f.checkpointFindMany.mockImplementation(
      async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id) => {
          if (id === 'c3') c3Reads += 1;
          return { id, revision: id === 'c3' && c3Reads > 1 ? 2 : 1 };
        }),
    );
    expect(await f.service.valid('checkpoint', 'c0', f.tx, 'org')).toBe(false);
    expect(c3Reads).toBe(2);
  });

  it('rejects a dependency cycle', async () => {
    const f = fixture([...dag(), checkpointEdge('c3', 'c1')]);
    expect(await f.service.valid('checkpoint', 'c0', f.tx, 'org')).toBe(false);
  });

  it('rejects a self-referencing edge', async () => {
    const f = fixture([checkpointEdge('c0', 'c0')]);
    expect(await f.service.valid('checkpoint', 'c0', f.tx, 'org')).toBe(false);
  });

  it('rejects a shared node pinned at conflicting versions', async () => {
    const edges = dag();
    edges[3] = checkpointEdge('c2', 'c3', { sourceVersion: '2' });
    const f = fixture(edges);
    expect(await f.service.valid('checkpoint', 'c0', f.tx, 'org')).toBe(false);
  });

  it('rejects an invalidated edge and a derived node with no edges', async () => {
    const invalid = dag();
    invalid[6] = { ...invalid[6], valid: false };
    const broken = fixture(invalid);
    expect(
      await broken.service.valid('checkpoint', 'c0', broken.tx, 'org'),
    ).toBe(false);
    const f = fixture(dag().filter((edge) => edge.derivedId !== 'c4'));
    expect(await f.service.valid('checkpoint', 'c0', f.tx, 'org')).toBe(false);
  });

  it('fails closed with a clear error past the node cap', async () => {
    const edges = Array.from(
      { length: LEARNING_DEPENDENCY_WALK_MAX_NODES + 1 },
      (_, index) => checkpointEdge('root', `leaf-${index}`),
    );
    const f = fixture(edges);
    await expect(
      f.service.valid('checkpoint', 'root', f.tx, 'org'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('bounds the edge read and fails fast on a very high-fanout root', async () => {
    const f = fixture(
      Array.from({ length: LEARNING_DEPENDENCY_WALK_MAX_NODES * 4 }, (_, i) =>
        checkpointEdge('root', `leaf-${i}`),
      ),
    );
    await expect(
      f.service.valid('checkpoint', 'root', f.tx, 'org'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: LEARNING_DEPENDENCY_WALK_MAX_NODES + 1 }),
    );
  });
});
