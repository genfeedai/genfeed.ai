import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import {
  hash,
  receipt,
  report,
  text,
} from '@api/collections/outliers/services/breakout-receipt.fixture';
import { loadPostExposurePublication } from '@api/collections/outliers/services/post-exposure-observation.util';
import type { BrandedPostMaterialRecord } from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import {
  IngredientCategory,
  IngredientStatus,
  PersistedReviewDecision,
  Platform,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type { BreakoutOutputRecoveryInput } from '@genfeedai/contracts/interfaces';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/post-exposure-observation.util',
  () => ({ loadPostExposurePublication: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/native-source-exposure-observation.util',
  () => ({ loadNativeSourceExposurePublication: vi.fn() }),
);

const input: BreakoutOutputRecoveryInput = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.INSTAGRAM,
  responseId: 'response-a',
  outputId: 'output-a',
};

function visual(index: number, status: string = IngredientStatus.GENERATED) {
  return {
    id: `asset-${index + 1}`,
    groupIndex: index,
    sourceActionId: `generation-a:media:${index + 1}`,
    status,
    s3Key: `media/asset-${index + 1}` as string | null,
    version: 1 as number | null,
  };
}
function composed(ids: string[]): BrandedPostMaterialRecord {
  return {
    id: 'post-output-a',
    organizationId: input.organizationId,
    brandId: input.brandId,
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
    ingredients: ids.map((id) => ({
      id,
      organizationId: input.organizationId,
      brandId: input.brandId,
      isDeleted: false,
      category: IngredientCategory.IMAGE,
      s3Key: `media/${id}`,
      version: 1,
      fileSize: 5,
      mimeType: 'image/png',
      cdnUrl: `https://cdn.test/${id}`,
    })),
    children: [],
  };
}

function fixture(format = 'carousel') {
  const parts = format === 'carousel' ? 3 : 1;
  const projection = receipt();
  const row = {
    id: projection.id,
    organizationId: input.organizationId,
    brandId: input.brandId,
    requestKey: 'generation-a',
    candidateIndex: 0,
    revision: projection.revision,
    state: projection.state,
    mode: projection.mode,
    providerAttemptRef: projection.execution?.providerAttemptRef ?? null,
    projection: projection as unknown,
  };
  const response = {
    ...input,
    id: input.responseId,
    isDeleted: false,
    externalId: 'source-post',
    state: 'planned',
    outputPlanFingerprint: 'plan-a',
    sourcePostId: 'post-source-a' as string | null,
    nativeSourcePostId: null as string | null,
    logicalPostId: 'logical-source-a',
    contentDigest: hash,
    publicationFingerprint: hash,
  };
  const output = {
    ...input,
    id: input.outputId,
    isDeleted: false,
    generationKey: 'generation-a',
    kind: 'follow_up',
    ordinal: 2,
    format,
    state: 'reserved',
    workflowExecutionId: null as string | null,
    heldReason: null as string | null,
  };
  const state = {
    row: row as typeof row | null,
    visuals: Array.from({ length: parts }, (_, index) => visual(index)),
    post: null as (BrandedPostMaterialRecord & Record<string, unknown>) | null,
  };
  const tx = {
    breakoutResponse: { findFirst: vi.fn(async () => response) },
    breakoutResponseOutput: { findFirst: vi.fn(async () => output) },
    post: { findFirst: vi.fn(async () => state.post) },
    brandedGenerationReceipt: { findFirst: vi.fn(async () => state.row) },
    ingredient: { findMany: vi.fn(async () => state.visuals) },
  } as unknown as Prisma.TransactionClient;
  function retain(next: BrandedGenerationReceiptV1) {
    expect(brandedGenerationReceiptV1Schema.safeParse(next).success).toBe(true);
    state.row = {
      ...row,
      state: next.state,
      mode: next.mode,
      projection: next as unknown,
      providerAttemptRef: next.execution?.providerAttemptRef ?? null,
    };
  }
  function ready() {
    retain({
      ...projection,
      state: 'ready',
      compliance: 'passed',
      validation: report(),
    });
  }
  function compose() {
    state.post = {
      ...composed(state.visuals.map((item) => item.id)),
      externalId: null,
      targetExecutionState: TargetExecutionState.DRAFT,
      quoteTweetId: null,
      reviewDecision: null,
      reviewVersionPinId: null,
    };
  }
  return { tx, state, output, response, projection, retain, ready, compose };
}
const read = (h: ReturnType<typeof fixture>) =>
  readBreakoutOutputRecovery(h.tx, input);

describe('visual output recovery facts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadPostExposurePublication).mockResolvedValue(null);
  });

  it('never authorizes a paid request from any visual state', async () => {
    const h = fixture();
    h.ready();
    h.compose();
    expect(await read(h)).toMatchObject({ mayRepeatPaidRequest: false });
  });

  it('reads an undispatched output as awaiting admission, and a capability hold as awaiting review', async () => {
    const h = fixture();
    h.state.row = null;
    expect(await read(h)).toMatchObject({
      state: 'not_submitted',
      reason: 'not_dispatched',
      action: 'requires_admission',
    });
    h.output.heldReason = 'media_brand_capability_unavailable';
    expect(await read(h)).toMatchObject({
      state: 'awaiting_review',
      reason: 'media_brand_capability_unavailable',
    });
    h.output.heldReason = null;
    h.output.workflowExecutionId = 'execution-a';
    expect(await read(h)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'generation_receipt_missing',
    });
  });

  it('reads the caption receipt’s in-flight, indeterminate, failed and blocked outcomes', async () => {
    const h = fixture();
    const execution = h.projection.execution;
    if (!execution) throw new Error('fixture execution is required');
    h.retain({
      ...h.projection,
      state: 'blocked',
      compliance: 'unverified',
      artifact: null,
      validation: null,
      execution: { ...execution, result: 'indeterminate' },
    });
    expect(await read(h)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'generation_outcome_indeterminate',
    });
    h.retain({
      ...h.projection,
      state: 'blocked',
      compliance: 'unverified',
      artifact: null,
      validation: null,
      execution: { ...execution, result: 'failed' },
    });
    expect(await read(h)).toMatchObject({
      state: 'failed',
      reason: 'generation_failed',
    });
    h.retain({ ...h.projection, state: 'blocked' });
    expect(await read(h)).toMatchObject({
      state: 'awaiting_review',
      reason: 'quality_or_brand_blocked',
    });
  });

  it('requires the approved-brand caption receipt, not a receipt of another format', async () => {
    const h = fixture();
    h.retain({
      ...h.projection,
      state: 'ready',
      compliance: 'passed',
      validation: report(),
      format: 'image',
    });
    expect(await read(h)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'receipt_invalid',
    });
  });

  it('reads the visuals of the generation group in order after the caption', async () => {
    const h = fixture('carousel');
    h.ready();
    // Nothing dispatched yet.
    h.state.visuals = [];
    expect(await read(h)).toMatchObject({
      state: 'not_submitted',
      reason: 'not_dispatched',
      action: 'requires_admission',
      postId: 'post-output-a',
    });
    // Claimed but no placeholder exists: an ambiguous dispatch.
    h.output.state = 'generating';
    h.output.workflowExecutionId = 'execution-a';
    expect(await read(h)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'media_generation_incomplete',
      action: 'reconcile',
    });
    // Only some visuals exist.
    h.state.visuals = [visual(0), visual(1)];
    expect(await read(h)).toMatchObject({
      reason: 'media_generation_incomplete',
    });
    // Out of order.
    h.state.visuals = [visual(0), visual(2), visual(1)];
    expect(await read(h)).toMatchObject({
      reason: 'media_generation_incomplete',
    });
    // One is still generating.
    h.state.visuals = [
      visual(0),
      visual(1, IngredientStatus.PROCESSING),
      visual(2),
    ];
    expect(await read(h)).toMatchObject({
      state: 'generation_in_flight',
      reason: 'provider_pending',
      action: 'wait',
    });
    // One failed.
    h.state.visuals = [
      visual(0),
      visual(1, IngredientStatus.FAILED),
      visual(2),
    ];
    expect(await read(h)).toMatchObject({
      state: 'failed',
      reason: 'generation_failed',
    });
    // One completed without stored bytes.
    h.state.visuals = [visual(0), { ...visual(1), s3Key: null }, visual(2)];
    expect(await read(h)).toMatchObject({ state: 'generation_in_flight' });
  });

  it('offers the free composition once every visual is ready and nothing is bound', async () => {
    const h = fixture('carousel');
    h.ready();
    h.output.state = 'generating';
    h.output.workflowExecutionId = 'execution-a';
    expect(await read(h)).toMatchObject({
      state: 'generated',
      reason: 'artifact_binding_missing',
      action: 'use_existing_artifact',
      postId: 'post-output-a',
    });
  });

  it('projects the shared quality and publication state of the composed post', async () => {
    const h = fixture('carousel');
    h.ready();
    h.output.state = 'generating';
    h.output.workflowExecutionId = 'execution-a';
    h.compose();
    expect(await read(h)).toMatchObject({
      state: 'draft',
      reason: 'publication_admission_required',
    });
    h.output.heldReason = 'quality_evaluation_pending';
    expect(await read(h)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'quality_evaluation_pending',
    });
    h.output.heldReason = 'platform_quality_blocked';
    expect(await read(h)).toMatchObject({
      state: 'awaiting_review',
      reason: 'platform_quality_blocked',
    });
    h.output.heldReason = null;
    if (!h.state.post) throw new Error('composed post is required');
    h.state.post.targetExecutionState = TargetExecutionState.SCHEDULED;
    expect(await read(h)).toMatchObject({ state: 'scheduled' });
    h.state.post.targetExecutionState = TargetExecutionState.PUBLISHING;
    expect(await read(h)).toMatchObject({
      state: 'publishing',
      action: 'wait',
    });
  });

  it('reconciles a composed post whose caption, visuals or format no longer match', async () => {
    const h = fixture('carousel');
    h.ready();
    h.output.state = 'generating';
    h.output.workflowExecutionId = 'execution-a';
    h.compose();
    if (!h.state.post) throw new Error('composed post is required');
    h.state.post.description = 'Edited after approval';
    expect(await read(h)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'artifact_binding_missing',
    });
    h.compose();
    h.state.post.ingredients = h.state.post.ingredients.slice(0, 2);
    expect(await read(h)).toMatchObject({
      reason: 'artifact_binding_missing',
    });
  });

  it('holds a composed post for brand review until a member explicitly approves this exact version', async () => {
    const h = fixture('carousel');
    h.retain({ ...h.projection, state: 'needs_review' });
    h.output.state = 'generating';
    h.output.workflowExecutionId = 'execution-a';
    h.compose();
    if (!h.state.post) throw new Error('composed post is required');
    expect(await read(h)).toMatchObject({
      state: 'awaiting_review',
      reason: 'brand_review_required',
    });
    Object.assign(h.state.post, {
      reviewDecision: PersistedReviewDecision.APPROVED,
      reviewVersionPinId: 'pin-a',
    });
    expect(await read(h)).toMatchObject({
      state: 'draft',
      reason: 'publication_admission_required',
    });
  });

  it('shows a platform that does not publish the format as a precise hold', async () => {
    const h = fixture('carousel');
    const youtube = {
      ...input,
      platform: Platform.YOUTUBE,
    };
    h.ready();
    h.response.platform = Platform.YOUTUBE;
    expect(await readBreakoutOutputRecovery(h.tx, youtube)).toMatchObject({
      state: 'awaiting_review',
      reason: 'format_unsupported_for_platform',
    });
  });
});
