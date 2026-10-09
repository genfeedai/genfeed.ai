import {
  bindBreakoutPostArtifact,
  bindBreakoutTextArtifact,
  readBreakoutOutputRecovery,
} from '@api/collections/outliers/services/breakout-output-recovery.util';
import { loadNativeSourceExposurePublication } from '@api/collections/outliers/services/native-source-exposure-observation.util';
import { loadPostExposurePublication } from '@api/collections/outliers/services/post-exposure-observation.util';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  type BrandedPostMaterialRecord,
  bindBrandedPostMaterialLayout,
  describeBrandedPostMaterialLayout,
} from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import {
  IngredientCategory,
  Platform,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type { BreakoutOutputRecoveryInput } from '@genfeedai/contracts/interfaces';
import type {
  BrandArtifactValidationReportV1,
  BrandedGenerationReceiptV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
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
const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
const text = 'Acme follows up with a useful new observation.';
const textVersion = hashBrandedGenerationTextV1(text);
const artifactHash = hashBrandedGenerationArtifactManifestV1({
  mediaKind: 'text',
  textHash: textVersion,
  parts: [],
});
function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt-a',
    organizationId: 'org-a',
    brandId: 'brand-a',
    actorId: 'user',
    requestKey: 'generation-a',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'checking',
    mode: 'approved_brand',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: {
      schemaVersion: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      revisionId: 'revision',
      revisionVersion: 1,
      approval: 'approved',
      resolvedAt: time,
      contentHash: hash,
      identity: { name: 'Acme' },
      voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
      generationRules: {
        schemaVersion: 1,
        evidence: [
          { id: 'evidence', sourceType: 'manual', label: 'Owner attestation' },
        ],
        facts: [
          {
            id: 'fact',
            kind: 'statement',
            subject: 'Acme',
            predicate: 'name',
            value: 'Acme',
            evidenceIds: ['evidence'],
            required: true,
            match: 'literal',
          },
        ],
        palette: [],
        typography: [],
        mandatory: [],
        avoid: [],
        examples: [],
        assets: [],
      },
      diagnostics: [],
    },
    resolutionHash: hash,
    layers: [],
    learning: {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'not_applicable',
        scope: { format: 'text', objective: 'engagement' },
      },
      privateAccount: {
        mode: 'no_destination',
        configVersion: 'v1',
        synthetic: false,
        application: {
          status: 'unavailable',
          reasonCodes: ['no_destination'],
          privatePolicyApplied: false,
          sharedReleaseApplied: false,
          revalidatedAt: time,
        },
      },
    },
    prompts: {
      original: {
        contentHash: hash,
        retention: 'retained',
        snapshotId: 'original',
      },
      enhanced: null,
      compiled: {
        contentHash: hash,
        retention: 'retained',
        snapshotId: 'compiled',
      },
    },
    execution: {
      provider: 'provider',
      model: 'model',
      providerAttemptRef: 'attempt',
      dispatchClaimedAt: time,
      result: 'completed',
    },
    artifact: {
      kind: 'post',
      id: 'post-output-a',
      version: textVersion,
      contentHash: artifactHash,
      mediaKind: 'text',
      parts: [],
    },
    validation: null,
    compliance: 'unverified',
    diagnostics: [],
    costs: [
      { id: 'pending-cost', stage: 'generation', status: 'pending' },
      {
        id: 'unavailable-cost',
        stage: 'validation',
        status: 'unavailable',
        reasonCode: 'ledger_unavailable',
      },
    ],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 1,
    },
    isDeleted: false,
  };
}
function report(): BrandArtifactValidationReportV1 {
  return {
    schemaVersion: 1,
    id: 'report',
    rubricVersion: 1,
    snapshotHash: hash,
    artifactHash,
    artifactId: 'post-output-a',
    artifactVersion: textVersion,
    checkedAt: time,
    checks: [
      {
        ruleId: 'fact',
        category: 'fact',
        severity: 'hard',
        result: 'pass',
        method: 'exact_text',
        evidenceIds: ['actual-text'],
      },
    ],
    quality: null,
    diagnostics: [],
  };
}

const input: BreakoutOutputRecoveryInput = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  responseId: 'response-a',
  outputId: 'output-a',
};
function materialPost(): BrandedPostMaterialRecord {
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
    category: PostCategory.TEXT,
    format: PostFormat.STANDARD,
    description: text,
    ingredients: [],
    children: [],
  };
}
function materialIngredient(
  id = 'image-a',
  category = IngredientCategory.IMAGE,
): BrandedPostMaterialRecord['ingredients'][number] {
  return {
    id,
    organizationId: input.organizationId,
    brandId: input.brandId,
    isDeleted: false,
    category,
    s3Key: `media/${id}`,
    version: 1,
    fileSize: 5,
    mimeType: category === IngredientCategory.VIDEO ? 'video/mp4' : 'image/png',
    cdnUrl: `https://example.test/${id}`,
  };
}
function fixture() {
  const projection = receipt();
  const response = {
    ...input,
    id: input.responseId,
    isDeleted: false,
    externalId: 'source-tweet',
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
    kind: 'quote',
    ordinal: 1,
    format: 'text',
    state: 'reserved',
    workflowExecutionId: null as string | null,
    heldReason: null as string | null,
  };
  const row = {
    id: projection.id,
    organizationId: input.organizationId,
    brandId: input.brandId,
    requestKey: output.generationKey,
    candidateIndex: 0,
    revision: projection.revision,
    state: projection.state,
    mode: projection.mode,
    providerAttemptRef: projection.execution?.providerAttemptRef ?? null,
    projection: projection as unknown,
  };
  const post = {
    ...materialPost(),
    externalId: 'output-tweet',
    targetExecutionState: TargetExecutionState.DRAFT,
    quoteTweetId: response.externalId as string | null,
    description: text,
  };
  const findPost = vi.fn(
    async (_query: Prisma.PostFindFirstArgs): Promise<typeof post | null> =>
      null,
  );
  const findReceipt = vi.fn(async (): Promise<typeof row | null> => row);
  const findResponse = vi.fn(async () => response);
  const findOutput = vi.fn(async () => output);
  const tx = {
    breakoutResponse: { findFirst: findResponse },
    breakoutResponseOutput: { findFirst: findOutput },
    post: { findFirst: findPost },
    brandedGenerationReceipt: { findFirst: findReceipt },
  } as unknown as Prisma.TransactionClient;
  function retain(next: BrandedGenerationReceiptV1) {
    expect(brandedGenerationReceiptV1Schema.safeParse(next).success).toBe(true);
    row.projection = next;
    row.state = next.state;
    row.mode = next.mode;
    row.providerAttemptRef = next.execution?.providerAttemptRef ?? null;
  }
  function ready() {
    retain({
      ...projection,
      state: 'ready',
      compliance: 'passed',
      validation: report(),
    });
  }
  return {
    tx,
    row,
    projection,
    response,
    output,
    post,
    findPost,
    findReceipt,
    findOutput,
    retain,
    ready,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadPostExposurePublication).mockResolvedValue(null);
});

describe('retained generation and publication recovery facts', () => {
  it.each(['image', 'carousel', 'video', 'short'])(
    'shows an actual %s capability hold without granting dispatch or retry',
    async (format) => {
      const h = fixture();
      h.output.format = format;
      h.output.kind = 'follow_up';
      h.output.heldReason = 'media_brand_capability_unavailable';
      h.output.workflowExecutionId = 'workflow-a';
      h.findReceipt.mockResolvedValue(null);
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state: 'awaiting_review',
        reason: 'media_brand_capability_unavailable',
        action: 'none',
        mayRepeatPaidRequest: false,
      });
      h.output.state = 'generating';
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state: 'reconciliation_required',
        reason: 'generation_receipt_missing',
      });
    },
  );
  it('does not hide an actual provider outcome behind an older capability hold', async () => {
    const h = fixture();
    h.output.heldReason = 'media_brand_capability_unavailable';
    const execution = h.projection.execution;
    if (!execution) throw new Error('fixture provider execution is required');
    h.retain({
      ...h.projection,
      execution: { ...execution, result: 'indeterminate' },
    });
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'generation_outcome_indeterminate',
      mayRepeatPaidRequest: false,
    });
  });
  it('never authorizes a paid request from a missing pre-dispatch receipt', async () => {
    const h = fixture();
    h.findReceipt.mockResolvedValue(null);
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'not_submitted',
      action: 'requires_admission',
      mayRepeatPaidRequest: false,
    });
    h.output.workflowExecutionId = 'workflow-a';
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'generation_receipt_missing',
      mayRepeatPaidRequest: false,
    });
  });
  it('requires fresh admission for a retained pre-dispatch receipt', async () => {
    const h = fixture();
    h.retain({
      ...h.projection,
      state: 'created',
      snapshot: null,
      resolutionHash: null,
      learning: null,
      execution: null,
      artifact: null,
      validation: null,
      compliance: 'unverified',
      budget: { ...h.projection.budget, generationAttemptsUsed: 0 },
    });
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'not_submitted',
      mayRepeatPaidRequest: false,
    });
  });
  it('waits on pending generation and reconciles an unknown paid outcome', async () => {
    const h = fixture();
    if (!h.projection.execution) throw new Error('Fixture execution missing');
    h.retain({
      ...h.projection,
      state: 'dispatched',
      artifact: null,
      execution: { ...h.projection.execution, result: 'pending' },
    });
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'generation_in_flight',
      action: 'wait',
      mayRepeatPaidRequest: false,
    });
    h.retain({
      ...h.projection,
      state: 'blocked',
      artifact: null,
      execution: { ...h.projection.execution, result: 'indeterminate' },
    });
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'generation_outcome_indeterminate',
      action: 'reconcile',
      mayRepeatPaidRequest: false,
    });
  });
  it('keeps a confirmed generation failure closed to blind retry', async () => {
    const h = fixture();
    if (!h.projection.execution) throw new Error('Fixture execution missing');
    h.retain({
      ...h.projection,
      state: 'failed',
      artifact: null,
      execution: { ...h.projection.execution, result: 'failed' },
    });
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'failed',
      reason: 'generation_failed',
      mayRepeatPaidRequest: false,
    });
  });
  it('requires actual approved brand validation before treating a generated artifact as reusable', async () => {
    const h = fixture();
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'awaiting_review',
      reason: 'brand_review_required',
    });
    h.retain({
      ...h.projection,
      mode: 'raw',
      state: 'ready',
      snapshot: null,
      compliance: 'not_claimed',
    });
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'awaiting_review',
      reason: 'approved_brand_required',
    });
    h.ready();
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'generated',
      action: 'use_existing_artifact',
      postId: null,
      mayRepeatPaidRequest: false,
    });
  });
  it.each([
    [TargetExecutionState.DRAFT, 'draft', 'requires_admission'],
    [TargetExecutionState.PAUSED, 'paused', 'none'],
    [TargetExecutionState.CANCELLED, 'suppressed', 'none'],
    [TargetExecutionState.SKIPPED, 'suppressed', 'none'],
    [TargetExecutionState.SCHEDULED, 'scheduled', 'none'],
    [TargetExecutionState.PUBLISHING, 'publishing', 'wait'],
    [TargetExecutionState.FAILED, 'failed', 'use_existing_artifact'],
  ] as const)(
    'distinguishes post execution %s',
    async (execution, state, action) => {
      const h = fixture();
      h.ready();
      h.post.targetExecutionState = execution;
      h.findPost.mockResolvedValue(h.post);
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state,
        action,
        postId: h.post.id,
        externalId: null,
        mayRepeatPaidRequest: false,
      });
    },
  );
  it('holds an edited quote binding instead of claiming the source was quoted', async () => {
    const h = fixture();
    h.ready();
    h.post.quoteTweetId = 'other-tweet';
    h.findPost.mockResolvedValue(h.post);
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'artifact_binding_missing',
    });
  });
  it('holds changed post material instead of reusing stale brand validation', async () => {
    const h = fixture();
    h.ready();
    h.post.description = 'Changed after validation';
    h.findPost.mockResolvedValue(h.post);
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'artifact_binding_missing',
      mayRepeatPaidRequest: false,
    });
  });
  it('never equates an output or post state with confirmed publication', async () => {
    const h = fixture();
    h.output.state = 'published';
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'reconciliation_required',
      reason: 'publication_confirmation_missing',
    });
    h.post.targetExecutionState = TargetExecutionState.PUBLISHED;
    h.findPost.mockResolvedValue(h.post);
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'reconciliation_required',
      externalId: null,
    });
  });
  it('reports canonical confirmed publication even after response suppression', async () => {
    const h = fixture();
    h.response.state = 'suppressed';
    h.post.targetExecutionState = TargetExecutionState.PUBLISHED;
    h.findPost.mockResolvedValue(h.post);
    vi.mocked(loadPostExposurePublication).mockResolvedValue({
      ...input,
      version: 1,
      postId: h.post.id,
      externalId: h.post.externalId,
      format: 'text',
      publishedAt: time,
      contentDigest: hash,
      publicationFingerprint: hash,
      logicalPostId: 'logical-output',
      isResponse: true,
    });
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      state: 'published',
      reason: 'confirmed_publication',
      externalId: h.post.externalId,
      mayRepeatPaidRequest: false,
    });
    expect(h.findReceipt).not.toHaveBeenCalled();
  });
  it.each(['suppressed', 'expired'] as const)(
    'retains %s output state',
    async (state) => {
      const h = fixture();
      h.output.state = state;
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state,
        action: 'none',
        mayRepeatPaidRequest: false,
      });
    },
  );
  it('does not trust an invalid, mismatched or tombstoned receipt projection', async () => {
    const h = fixture();
    h.row.projection = { state: 'ready' };
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      reason: 'receipt_invalid',
    });
    h.row.projection = { ...h.projection, requestKey: 'foreign-request' };
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      reason: 'receipt_invalid',
    });
    h.row.projection = { ...h.projection, isDeleted: true };
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      reason: 'receipt_invalid',
    });
    h.row.projection = h.projection;
    h.row.revision = 99;
    expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
      reason: 'receipt_invalid',
    });
  });
  it('reads every retained record inside organization, brand and account scope', async () => {
    const h = fixture();
    await readBreakoutOutputRecovery(h.tx, input);
    expect(h.findOutput).toHaveBeenCalledWith({
      where: {
        id: input.outputId,
        responseId: input.responseId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        credentialId: input.credentialId,
        isDeleted: false,
      },
    });
    expect(h.findReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          requestKey: h.output.generationKey,
          candidateIndex: 0,
          isDeleted: false,
        },
      }),
    );
    h.output.brandId = 'foreign-brand';
    expect(await readBreakoutOutputRecovery(h.tx, input)).toEqual({
      status: 'unavailable',
      reason: 'scope_mismatch',
    });
  });
});

function bindingFixture() {
  const h = fixture();
  h.ready();
  const post = {
    ...h.post,
    breakoutOutputId: null as string | null,
    quoteTweetId: null as string | null,
    publishApprovalId: null as string | null,
    reviewVersionPinId: null as string | null,
  };
  h.findPost.mockImplementation(async (query) =>
    query.where?.id ? post : post.breakoutOutputId ? post : null,
  );
  vi.mocked(loadPostExposurePublication).mockResolvedValue({
    ...input,
    version: 1,
    postId: h.response.sourcePostId ?? 'post-source-a',
    externalId: h.response.externalId,
    format: 'text',
    publishedAt: time,
    logicalPostId: h.response.logicalPostId,
    publicationFingerprint: h.response.publicationFingerprint,
    contentDigest: h.response.contentDigest,
    isResponse: false,
  });
  const update = vi.fn(async (query: Prisma.PostUpdateManyArgs) => {
    if (!query.data) throw new Error('Fixture update missing');
    post.breakoutOutputId = input.outputId;
    if (
      typeof query.data.quoteTweetId === 'string' ||
      query.data.quoteTweetId === null
    )
      post.quoteTweetId = query.data.quoteTweetId;
    return { count: 1 };
  });
  const tx = {
    $queryRaw: vi.fn(async () => []),
    breakoutResponse: { findFirst: vi.fn(async () => h.response) },
    breakoutResponseOutput: { findFirst: h.findOutput },
    post: { findFirst: h.findPost, updateMany: update },
    brandedGenerationReceipt: { findFirst: h.findReceipt },
  } as unknown as Prisma.TransactionClient;
  return { ...h, post, update, tx, binding: { ...input, postId: post.id } };
}
function composedBindingFixture(
  format: 'text' | 'image' | 'video' | 'short' | 'carousel' | 'thread',
) {
  const h = bindingFixture();
  h.output.kind = 'follow_up';
  h.output.format = format;
  if (format === 'thread') {
    h.post.format = PostFormat.THREAD;
    h.post.children = [
      {
        ...materialPost(),
        id: 'child-a',
        parentId: h.post.id,
        order: 1,
        description: 'Another useful segment.',
        children: [],
      },
    ];
  } else if (format !== 'text') {
    h.post.category =
      format === 'short'
        ? PostCategory.REEL
        : format === 'video'
          ? PostCategory.VIDEO
          : PostCategory.IMAGE;
    h.post.ingredients = [
      materialIngredient(
        'first',
        format === 'video' || format === 'short'
          ? IngredientCategory.VIDEO
          : IngredientCategory.IMAGE,
      ),
    ];
    if (format === 'carousel')
      h.post.ingredients.push(materialIngredient('second'));
  }
  const layout = describeBrandedPostMaterialLayout(input, h.post);
  const material = bindBrandedPostMaterialLayout(
    layout,
    layout.entries.map((entry) => ({
      id: entry.id,
      role: entry.role,
      version: entry.kind === 'text' ? entry.version : 'storage-version-a',
      contentHash: entry.kind === 'text' ? entry.contentHash : hash,
    })),
  );
  const projection = {
    ...h.projection,
    format,
    artifact: material.artifact,
    learning: {
      ...h.projection.learning,
      global: {
        ...h.projection.learning.global,
        scope: { ...h.projection.learning.global.scope, format },
      },
    },
  };
  h.retain({ ...projection, state: 'needs_review' });
  function qualifyFakeReceipt() {
    h.retain({
      ...projection,
      state: 'ready',
      compliance: 'passed',
      validation: {
        ...report(),
        artifactHash: material.artifact.contentHash,
        artifactVersion: material.artifact.version,
        checks: report().checks.map((check) => ({
          ...check,
          method:
            material.artifact.mediaKind === 'text'
              ? ('exact_text' as const)
              : ('deterministic_render' as const),
        })),
      },
    });
  }
  return { ...h, qualifyFakeReceipt };
}

describe('complete output artifact lineage and recovery', () => {
  it.each(['text', 'image', 'video', 'short', 'carousel', 'thread'] as const)(
    'binds and recovers a complete %s output through normal review/publication states',
    async (format) => {
      const h = composedBindingFixture(format);
      expect(await bindBreakoutPostArtifact(h.tx, h.binding)).toEqual({
        status: 'bound',
        outputId: input.outputId,
        postId: h.post.id,
      });
      expect(h.post.quoteTweetId).toBeNull();
      expect(h.post.publishApprovalId).toBeNull();
      expect(h.post.targetExecutionState).toBe(TargetExecutionState.DRAFT);
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state: 'awaiting_review',
        mayRepeatPaidRequest: false,
      });
      expect(await bindBreakoutPostArtifact(h.tx, h.binding)).toMatchObject({
        status: 'replayed',
      });
      h.qualifyFakeReceipt();
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state: 'draft',
        action: 'requires_admission',
      });
      h.post.targetExecutionState = TargetExecutionState.SCHEDULED;
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state: 'scheduled',
        action: 'none',
      });
      h.post.targetExecutionState = TargetExecutionState.PUBLISHING;
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state: 'publishing',
        action: 'wait',
      });
      h.post.targetExecutionState = TargetExecutionState.PUBLISHED;
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state: 'reconciliation_required',
      });
      vi.mocked(loadPostExposurePublication).mockResolvedValue({
        ...input,
        version: 1,
        postId: h.post.id,
        externalId: h.post.externalId,
        format,
        publishedAt: time,
        logicalPostId: 'logical-output',
        publicationFingerprint: hash,
        contentDigest: hash,
        isResponse: true,
      });
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state: 'published',
        reason: 'confirmed_publication',
        externalId: h.post.externalId,
      });
    },
  );

  it.each(['image', 'video', 'short', 'carousel', 'thread'] as const)(
    'holds a changed complete %s artifact without another paid request',
    async (format) => {
      const h = composedBindingFixture(format);
      await bindBreakoutPostArtifact(h.tx, h.binding);
      h.qualifyFakeReceipt();
      if (format === 'thread')
        h.post.children[0].description = 'Changed ending';
      else h.post.ingredients[0].version += 1;
      expect(await bindBreakoutPostArtifact(h.tx, h.binding)).toEqual({
        status: 'held',
        reason: 'artifact_changed',
      });
      expect(await readBreakoutOutputRecovery(h.tx, input)).toMatchObject({
        state: 'reconciliation_required',
        reason: 'artifact_binding_missing',
        mayRepeatPaidRequest: false,
      });
    },
  );

  it('does not reinterpret a non-text output as an X quote', async () => {
    const h = composedBindingFixture('image');
    h.output.kind = 'quote';
    expect(await bindBreakoutPostArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'unsupported_format',
    });
    expect(h.update).not.toHaveBeenCalled();
  });
});
describe('text artifact lineage before normal review and publication', () => {
  it('binds useful X quote commentary to an imported winning source without creating a source Post', async () => {
    const h = bindingFixture();
    h.response.sourcePostId = null;
    h.response.nativeSourcePostId = 'native-source-a';
    vi.mocked(loadNativeSourceExposurePublication).mockResolvedValue({
      version: 1,
      sourceKind: 'native_source_post',
      sourcePostId: 'native-source-a',
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: input.credentialId,
      platform: input.platform,
      externalId: h.response.externalId,
      format: 'text',
      publishedAt: time,
      logicalPostId: h.response.logicalPostId,
      contentDigest: h.response.contentDigest,
      publicationFingerprint: h.response.publicationFingerprint,
      isResponse: false,
    });
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toMatchObject({
      status: 'bound',
    });
    expect(loadNativeSourceExposurePublication).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        postId: null,
        nativeSourcePostId: 'native-source-a',
      }),
    );
    expect(h.post.quoteTweetId).toBe(h.response.externalId);
    expect(h.post.publishApprovalId).toBeNull();
  });

  it('attaches the existing output and source quote without publishing or granting approval', async () => {
    const h = bindingFixture();
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'bound',
      postId: h.post.id,
      outputId: input.outputId,
    });
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          breakoutOutputId: input.outputId,
          quoteTweetId: h.response.externalId,
        },
        where: expect.objectContaining({
          organizationId: input.organizationId,
          brandId: input.brandId,
          credentialId: input.credentialId,
          isDeleted: false,
          targetExecutionState: TargetExecutionState.DRAFT,
          publishApprovalId: null,
          reviewVersionPinId: null,
        }),
      }),
    );
    expect(h.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(h.post.targetExecutionState).toBe(TargetExecutionState.DRAFT);
    expect(h.post.publishApprovalId).toBeNull();
    h.update.mockClear();
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'replayed',
      postId: h.post.id,
      outputId: input.outputId,
    });
    expect(h.update).not.toHaveBeenCalled();
  });
  it('binds a review-needed completed artifact without marking it ready', async () => {
    const h = bindingFixture();
    h.retain({ ...h.projection, state: 'needs_review' });
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toMatchObject({
      status: 'bound',
    });
    expect(h.row.state).toBe('needs_review');
    expect(h.post.targetExecutionState).toBe(TargetExecutionState.DRAFT);
  });
  it('does not convert a caption receipt into a media or thread binding', async () => {
    const h = bindingFixture();
    h.output.format = 'image';
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'unsupported_format',
    });
    expect(h.update).not.toHaveBeenCalled();
    h.output.format = 'text';
    h.post.ingredients.push(materialIngredient());
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'artifact_changed',
    });
  });
  it('rejects changed text, changed source and conflicting lineage', async () => {
    const h = bindingFixture();
    h.post.description = 'Changed';
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'artifact_changed',
    });
    h.post.description = text;
    vi.mocked(loadPostExposurePublication).mockResolvedValue(null);
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'source_changed',
    });
    h.post.breakoutOutputId = 'other-output';
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'source_changed',
    });
    expect(h.update).not.toHaveBeenCalled();
  });
  it('rejects an existing different output or source quote binding', async () => {
    const h = bindingFixture();
    h.post.breakoutOutputId = 'other-output';
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'binding_conflict',
    });
    h.post.breakoutOutputId = null;
    h.post.quoteTweetId = 'other-tweet';
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'binding_conflict',
    });
    expect(h.update).not.toHaveBeenCalled();
  });
  it.each([
    TargetExecutionState.SCHEDULED,
    TargetExecutionState.PUBLISHING,
    TargetExecutionState.PUBLISHED,
  ])('does not mutate a post after %s starts', async (state) => {
    const h = bindingFixture();
    h.post.targetExecutionState = state;
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'review_or_publication_started',
    });
    expect(h.update).not.toHaveBeenCalled();
  });
  it('does not invalidate an existing review approval while attaching quote metadata', async () => {
    const h = bindingFixture();
    h.post.publishApprovalId = 'approval-a';
    expect(await bindBreakoutTextArtifact(h.tx, h.binding)).toEqual({
      status: 'held',
      reason: 'review_or_publication_started',
    });
    expect(h.update).not.toHaveBeenCalled();
  });
  it('throws for a lost conditional write so the caller cannot commit a partial binding', async () => {
    const h = bindingFixture();
    h.update.mockResolvedValue({ count: 0 });
    await expect(bindBreakoutTextArtifact(h.tx, h.binding)).rejects.toThrow(
      'roll back transaction',
    );
  });
});
