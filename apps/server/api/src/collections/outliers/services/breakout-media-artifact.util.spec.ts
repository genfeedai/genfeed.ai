import { bindBreakoutMediaPostArtifact } from '@api/collections/outliers/services/breakout-media-artifact.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import {
  hash,
  receipt,
  report,
  text,
} from '@api/collections/outliers/services/breakout-receipt.fixture';
import { createPostIngredientLinks } from '@api/collections/posts/services/post-ingredient-links.util';
import type { BrandedPostMaterialRecord } from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import {
  IngredientCategory,
  IngredientStatus,
  Platform,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { BreakoutOutputRecoveryInput } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-publication-source.util',
  () => ({ loadBreakoutPublication: vi.fn() }),
);

const input = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.INSTAGRAM,
  responseId: 'response-a',
  outputId: 'output-a',
  postId: 'post-output-a',
};
const source = {
  version: 1 as const,
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.INSTAGRAM,
  postId: 'post-source-a',
  externalId: 'source-post',
  format: 'image' as const,
  publishedAt: '2026-10-08T12:00:00.000Z',
  contentDigest: hash,
  publicationFingerprint: hash,
  logicalPostId: 'logical-source-a',
  isResponse: false as const,
};

function ingredient(
  id: string,
  index: number,
  category = IngredientCategory.IMAGE,
) {
  return {
    id,
    groupIndex: index,
    sourceActionId: `generation-a:media:${index + 1}`,
    status: IngredientStatus.GENERATED as string,
    s3Key: `media/${id}`,
    version: 1 as number | null,
    category: category as string,
    cdnUrl: `https://cdn.test/${id}` as string | null,
  };
}
/** A post as the loader reads it: media sit in ordered links, not a flat list. */
type LoadedMaterial = Omit<BrandedPostMaterialRecord, 'ingredients'> & {
  ingredientLinks: Array<{
    ingredient: BrandedPostMaterialRecord['ingredients'][number];
  }>;
};
function material(
  ingredientIds: string[],
  overrides: Partial<LoadedMaterial> = {},
): LoadedMaterial {
  return {
    id: input.postId,
    organizationId: 'org-a',
    brandId: 'brand-a',
    isDeleted: false,
    parentId: null,
    order: 0,
    platform: input.platform,
    credentialId: input.credentialId,
    targetAttachments: [],
    targetSettings: {},
    category: PostCategory.IMAGE,
    format: PostFormat.STANDARD,
    description: text,
    ingredientLinks: ingredientIds.map((id) => ({
      ingredient: {
        id,
        organizationId: 'org-a',
        brandId: 'brand-a',
        isDeleted: false,
        category: IngredientCategory.IMAGE,
        s3Key: `media/${id}`,
        version: 1,
        fileSize: 5,
        mimeType: 'image/png',
        cdnUrl: `https://cdn.test/${id}`,
      },
    })),
    children: [],
    ...overrides,
  };
}

function fixture(format: 'image' | 'carousel' = 'image') {
  const parts = format === 'carousel' ? 3 : 1;
  const ids = Array.from({ length: parts }, (_, index) => `asset-${index + 1}`);
  const projection = {
    ...receipt(),
    state: 'ready' as const,
    compliance: 'passed' as const,
    validation: report(),
  };
  const row = {
    id: projection.id,
    organizationId: 'org-a',
    brandId: 'brand-a',
    requestKey: 'generation-a',
    candidateIndex: 0,
    revision: projection.revision,
    state: projection.state,
    mode: projection.mode,
    providerAttemptRef: projection.execution?.providerAttemptRef ?? null,
    projection: projection as unknown,
  };
  const response = {
    state: 'planned',
    outputPlanFingerprint: 'plan-a',
    sourcePostId: 'post-source-a',
    nativeSourcePostId: null,
    externalId: 'source-post',
    logicalPostId: source.logicalPostId,
    contentDigest: hash,
    publicationFingerprint: hash,
  };
  const output = {
    id: 'output-a',
    generationKey: 'generation-a',
    kind: 'follow_up',
    format: format as string,
    state: 'generating',
    workflowExecutionId: 'execution-a',
  };
  const state = {
    post: {
      ...material([]),
      category: PostCategory.TEXT,
      breakoutOutputId: null as string | null,
      quoteTweetId: null as string | null,
      targetExecutionState: TargetExecutionState.DRAFT as string,
      publishApprovalId: null as string | null,
      reviewVersionPinId: null as string | null,
    },
    bound: null as { id: string } | null,
    visuals: ids.map((id, index) => ingredient(id, index)),
    row: row as typeof row | null,
    composed: material(ids),
  };
  const findPost = vi.fn(
    async (args: Prisma.PostFindFirstArgs): Promise<unknown> => {
      const where = args.where as Record<string, unknown>;
      if (
        'breakoutOutputId' in where &&
        typeof where.breakoutOutputId === 'string'
      )
        return state.bound;
      if (args.select && 'breakoutOutputId' in args.select) return state.post;
      return state.composed;
    },
  );
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const update = vi.fn(async () => ({}));
  const tx = {
    $queryRaw: vi.fn(async () => []),
    breakoutResponse: { findFirst: vi.fn(async () => response) },
    breakoutResponseOutput: { findFirst: vi.fn(async () => output) },
    brandedGenerationReceipt: { findFirst: vi.fn(async () => state.row) },
    ingredient: { findMany: vi.fn(async () => state.visuals) },
    post: { findFirst: findPost, updateMany, update },
  } as unknown as Prisma.TransactionClient;
  return {
    tx,
    state,
    response,
    output,
    row,
    projection,
    updateMany,
    update,
    ids,
  };
}
const run = (h: ReturnType<typeof fixture>) =>
  bindBreakoutMediaPostArtifact(
    h.tx,
    input as BreakoutOutputRecoveryInput & {
      postId: string;
    },
  );

describe('composing a visual output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadBreakoutPublication).mockResolvedValue(source);
  });

  it('attaches the generated visual to the proven caption draft and binds it to the output', async () => {
    const h = fixture('image');
    expect(await run(h)).toEqual({
      status: 'bound',
      outputId: 'output-a',
      postId: 'post-output-a',
    });
    expect(h.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'post-output-a',
        breakoutOutputId: null,
        targetExecutionState: TargetExecutionState.DRAFT,
        publishApprovalId: null,
        reviewVersionPinId: null,
      }),
      data: {
        breakoutOutputId: 'output-a',
        category: PostCategory.IMAGE,
        label: text,
      },
    });
    expect(h.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'post-output-a' }),
      data: {
        ingredientLinks: createPostIngredientLinks('org-a', ['asset-1']),
      },
    });
  });

  it('keeps a carousel’s generated order explicitly', async () => {
    const h = fixture('carousel');
    expect(await run(h)).toMatchObject({ status: 'bound' });
    expect(h.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetAttachments: [
            'https://cdn.test/asset-1',
            'https://cdn.test/asset-2',
            'https://cdn.test/asset-3',
          ],
        }),
      }),
    );
  });

  it('replays an already composed output without writing', async () => {
    const h = fixture('image');
    h.state.post.breakoutOutputId = 'output-a';
    h.state.post.ingredientLinks = material(h.ids).ingredientLinks;
    h.state.bound = { id: 'post-output-a' };
    expect(await run(h)).toMatchObject({ status: 'replayed' });
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('holds a replay whose attached visuals are not the output’s own', async () => {
    const h = fixture('image');
    h.state.post.breakoutOutputId = 'output-a';
    h.state.post.ingredientLinks = material(['other-asset']).ingredientLinks;
    h.state.bound = { id: 'post-output-a' };
    expect(await run(h)).toEqual({
      status: 'held',
      reason: 'binding_conflict',
    });
  });

  it('composes a caption the approved-brand receipt left needing review, which stays unpublishable until a member clears it', async () => {
    const h = fixture('image');
    const projection = {
      ...h.projection,
      state: 'needs_review' as const,
      compliance: 'unverified' as const,
    };
    h.state.row = {
      ...h.row,
      state: 'needs_review' as never,
      projection,
    };
    expect(await run(h)).toEqual({
      status: 'bound',
      outputId: 'output-a',
      postId: 'post-output-a',
    });
    expect(h.updateMany).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'a receipt row that disagrees with its projection',
      (h: ReturnType<typeof fixture>) => {
        h.state.row = { ...h.row, state: 'needs_review' as never };
      },
      'receipt_invalid',
    ],
    [
      'a missing caption receipt',
      (h: ReturnType<typeof fixture>) => {
        h.state.row = null;
      },
      'receipt_invalid',
    ],
    [
      'an edited caption',
      (h: ReturnType<typeof fixture>) => {
        h.state.post.description = 'Edited after the receipt';
      },
      'artifact_changed',
    ],
    [
      'a visual still generating',
      (h: ReturnType<typeof fixture>) => {
        h.state.visuals[0].status = IngredientStatus.PROCESSING;
      },
      'media_incomplete',
    ],
    [
      'a missing visual',
      (h: ReturnType<typeof fixture>) => {
        h.state.visuals.pop();
        h.state.visuals.pop();
        h.state.visuals.pop();
      },
      'media_incomplete',
    ],
    [
      'a visual out of order',
      (h: ReturnType<typeof fixture>) => {
        h.state.visuals[0].groupIndex = 1;
      },
      'media_incomplete',
    ],
    [
      'a visual of another category',
      (h: ReturnType<typeof fixture>) => {
        h.state.visuals[0].category = IngredientCategory.VIDEO;
      },
      'media_incomplete',
    ],
    [
      'a visual without stored bytes',
      (h: ReturnType<typeof fixture>) => {
        h.state.visuals[0].s3Key = '';
      },
      'media_incomplete',
    ],
    [
      'a draft already approved for publication',
      (h: ReturnType<typeof fixture>) => {
        h.state.post.publishApprovalId = 'approval-a';
      },
      'review_or_publication_started',
    ],
    [
      'a draft that already carries media',
      (h: ReturnType<typeof fixture>) => {
        h.state.post.ingredientLinks = material(['stray']).ingredientLinks;
      },
      'artifact_changed',
    ],
    [
      'a post bound to another output',
      (h: ReturnType<typeof fixture>) => {
        h.state.post.breakoutOutputId = 'other-output';
      },
      'binding_conflict',
    ],
    [
      'another post already bound to the output',
      (h: ReturnType<typeof fixture>) => {
        h.state.bound = { id: 'another-post' };
      },
      'binding_conflict',
    ],
  ])('holds %s without writing', async (_label, mutate, reason) => {
    const h = fixture('image');
    mutate(h);
    expect(await run(h)).toEqual({ status: 'held', reason });
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('holds a changed source, a quote slot and an unpublishable format', async () => {
    const h = fixture('image');
    vi.mocked(loadBreakoutPublication).mockResolvedValueOnce({
      ...source,
      contentDigest: 'edited',
    });
    expect(await run(h)).toEqual({ status: 'held', reason: 'source_changed' });
    h.output.kind = 'quote';
    expect(await run(h)).toEqual({
      status: 'held',
      reason: 'unsupported_format',
    });
    h.output.kind = 'follow_up';
    h.output.format = 'text';
    expect(await run(h)).toEqual({
      status: 'held',
      reason: 'unsupported_format',
    });
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('throws for a lost conditional write so the caller cannot commit a partial binding', async () => {
    const h = fixture('image');
    h.updateMany.mockResolvedValue({ count: 0 });
    await expect(run(h)).rejects.toThrow('roll back transaction');
    expect(h.update).not.toHaveBeenCalled();
  });

  it('throws when the composed material does not read back as the output’s format', async () => {
    const h = fixture('image');
    h.state.composed = material(h.ids, { category: PostCategory.TEXT });
    h.state.composed.ingredientLinks = [];
    h.state.composed.description = text;
    await expect(run(h)).rejects.toThrow();
  });
});
