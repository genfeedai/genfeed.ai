import { readArtifactRecord } from '@api/agent-artifacts/agent-artifact-material.util';
import type { PostDocument } from '@api/collections/posts/post.schema';
import type { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

type GeneratedPost = Pick<
  PostDocument,
  'brandId' | 'id' | 'sourceActionId' | 'userId'
>;

export const readPostGenerationReceipts = traced(
  'readPostGenerationReceipts',
  async (
    prisma: Pick<Prisma.TransactionClient, 'brandedGenerationReceipt'>,
    organizationId: string,
    posts: readonly GeneratedPost[],
  ) => {
    const receipts = new Map<
      string,
      { receiptId: string; receiptState: string }
    >();
    const candidates = posts.flatMap((post) =>
      post.sourceActionId
        ? [{ brandId: post.brandId, requestKey: post.sourceActionId }]
        : [],
    );
    if (!candidates.length) return receipts;

    // Social generation writes its request key on the post. The receipt's
    // artifact binds that key to the exact post whose copy it produced.
    const rows = await prisma.brandedGenerationReceipt.findMany({
      where: {
        organizationId,
        isDeleted: false,
        surface: 'agent',
        candidateIndex: 0,
        state: { in: ['checking', 'ready', 'needs_review'] },
        OR: candidates,
      },
      select: {
        actorId: true,
        brandId: true,
        id: true,
        projection: true,
        requestKey: true,
        state: true,
      },
    });
    const byId = new Map(posts.map((post) => [post.id, post]));
    for (const row of rows) {
      const artifact = readArtifactRecord(
        readArtifactRecord(row.projection).artifact,
      );
      if (artifact.kind !== 'post' || typeof artifact.id !== 'string') continue;
      const post = byId.get(artifact.id);
      if (
        post?.brandId === row.brandId &&
        post.userId === row.actorId &&
        post.sourceActionId === row.requestKey
      ) {
        receipts.set(post.id, { receiptId: row.id, receiptState: row.state });
      }
    }
    return receipts;
  },
);
