import { admitBreakoutGenerationContinuation } from '@api/collections/outliers/services/breakout-generation-admission.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import type { BreakoutTextOutputGenerationRequest } from '@api/collections/outliers/services/breakout-text-output-generation.service';
import {
  type BreakoutTextOutputPreparationRequest,
  BreakoutTextOutputPreparationService,
} from '@api/collections/outliers/services/breakout-text-output-preparation.service';
import type { BrandedPostMaterialRecord } from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import {
  ContentLearningMode,
  ModelCategory,
  Platform,
  PostCategory,
  PostFormat,
} from '@genfeedai/contracts';
import type { BreakoutPublicationSourceV1 } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-generation-admission.util',
  () => ({ admitBreakoutGenerationContinuation: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-publication-source.util',
  () => ({ loadBreakoutPublication: vi.fn() }),
);
const source: BreakoutPublicationSourceV1 = {
  version: 1,
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  postId: 'original-a',
  externalId: 'tweet-a',
  format: 'text',
  publishedAt: '2026-10-08T12:00:00.000Z',
  contentDigest: 'digest-a',
  publicationFingerprint: 'publication-a',
  logicalPostId: 'logical-a',
  isResponse: false,
};
function fixture() {
  const admission = {
    scope: {
      version: 1 as const,
      organizationId: 'org-a',
      brandId: 'brand-a',
      platform: Platform.TWITTER,
      format: 'text' as 'text' | 'thread',
      strategyId: 'strategy-a',
    },
    credentialId: 'credential-a',
    responseId: 'response-a',
    outputId: 'output-a',
    workflowExecutionId: 'execution-a',
    actorUserId: 'configuring-user',
    componentKey: 'generation-a:caption',
    reauthorize: vi.fn(async () => undefined),
  };
  const request: BreakoutTextOutputPreparationRequest = {
    admission,
    textModelKey: 'openai/gpt-5.2',
  };
  const output = { generationKey: 'generation-a', kind: 'quote', ordinal: 1 };
  const response = {
    sourcePostId: 'original-a' as string | null,
    nativeSourcePostId: null as string | null,
    externalId: source.externalId,
    logicalPostId: source.logicalPostId,
    contentDigest: source.contentDigest,
    publicationFingerprint: source.publicationFingerprint,
  };
  const post: BrandedPostMaterialRecord = {
    id: 'original-a',
    organizationId: 'org-a',
    brandId: 'brand-a',
    credentialId: 'credential-a',
    platform: Platform.TWITTER,
    parentId: null as string | null,
    isDeleted: false,
    order: 0,
    category: PostCategory.TEXT,
    format: PostFormat.STANDARD as PostFormat,
    description: 'A concrete original example.',
    targetAttachments: [],
    targetSettings: {},
    ingredients: [],
    children: [],
  };
  const prisma = {
    $transaction: vi.fn(),
    breakoutResponseOutput: { findFirst: vi.fn(async () => output) },
    breakoutResponse: { findFirst: vi.fn(async () => response) },
    post: { findFirst: vi.fn(async () => post) },
    sourcePost: {
      findFirst: vi.fn(async () => ({ text: 'Actual imported original.' })),
    },
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
  );
  const registry = {
    validateModelForOrg: vi.fn(async () => ({
      key: request.textModelKey,
      category: ModelCategory.TEXT,
      isActive: true,
      isDeleted: false,
    })),
  };
  const accounts = {
    resolveDraft: vi.fn(async () => ({
      brand: { id: 'brand-a' },
      constraints: {
        maxWeightedCharacters: 280,
        usesWeightedCharacters: true,
        supportsThreads: true,
      },
    })),
  };
  const learning = {
    previewForContext: vi.fn(async () => ({
      receipt: {
        mode: ContentLearningMode.SHADOW as ContentLearningMode,
        reason: 'shadow',
        configVersion: 'rl-reward-v1-experimental',
        synthetic: false,
      },
      contribution: {},
    })),
  };
  const generation = {
    generate: vi.fn(
      async (_request: Readonly<BreakoutTextOutputGenerationRequest>) => ({
        kind: 'in_progress',
        hasNewDispatch: false,
      }),
    ),
  };
  const service = Reflect.construct(BreakoutTextOutputPreparationService, [
    prisma,
    registry,
    accounts,
    learning,
    generation,
  ]) as BreakoutTextOutputPreparationService;
  return {
    admission,
    request,
    output,
    response,
    post,
    prisma,
    registry,
    accounts,
    learning,
    generation,
    service,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(admitBreakoutGenerationContinuation).mockResolvedValue(undefined);
  vi.mocked(loadBreakoutPublication).mockResolvedValue(source);
});
describe('canonical source to actual breakout text consumer', () => {
  it('prepares a useful quote under the original actor and server identities', async () => {
    const h = fixture();
    await h.service.generate(h.request);
    const prepared = h.generation.generate.mock.calls[0]?.[0];
    expect(prepared).toMatchObject({
      input: {
        actorId: 'configuring-user',
        requestKey: 'generation-a',
        format: 'text',
        mode: 'approved_brand',
        provider: 'openrouter',
        model: 'openai/gpt-5.2',
        destinationCredentialId: 'credential-a',
        workflowExecutionId: 'execution-a',
      },
      privateLearning: {
        mode: 'shadow',
        application: {
          status: 'shadow',
          privatePolicyApplied: false,
          sharedReleaseApplied: false,
        },
      },
    });
    expect(prepared?.input.originalPrompt).toContain('Add a concrete example');
    expect(prepared?.input.originalPrompt).toContain(
      JSON.stringify(h.post.description),
    );
    expect(prepared?.acceptSegment('界'.repeat(141))).toBe(false);
    expect(h.prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'original-a',
          organizationId: 'org-a',
          brandId: 'brand-a',
          credentialId: 'credential-a',
          platform: 'twitter',
          isDeleted: false,
        },
      }),
    );
    expect(h.learning.previewForContext).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          credentialId: 'credential-a',
          requestKey: 'generation-a',
          candidateIndex: 0,
          objective: 'engagement',
          workflowExecutionId: 'execution-a',
        },
      }),
    );
  });
  it('uses the complete original ordered thread and generates a distinct follow-up', async () => {
    const h = fixture();
    h.admission.scope.format = 'thread';
    h.output.kind = 'follow_up';
    h.output.ordinal = 2;
    h.post.format = PostFormat.THREAD;
    const { children: _children, ...segment } = h.post;
    h.post.children = [
      {
        ...segment,
        id: 'child-b',
        parentId: h.post.id,
        order: 2,
        description: 'Second source segment.',
        children: [],
      },
      {
        ...segment,
        id: 'child-a',
        parentId: h.post.id,
        order: 1,
        description: 'First source segment.',
        children: [],
      },
    ];
    vi.mocked(loadBreakoutPublication).mockResolvedValue({
      ...source,
      format: 'thread',
    });
    await h.service.generate(h.request);
    const prepared = h.generation.generate.mock.calls[0]?.[0];
    expect(prepared?.input).toMatchObject({
      format: 'thread',
      contentType: 'thread',
    });
    expect(prepared?.input.originalPrompt).toContain(
      JSON.stringify(
        'A concrete original example.\n\nFirst source segment.\n\nSecond source segment.',
      ),
    );
    expect(prepared?.input.originalPrompt).toContain('follow-up 2');
  });
  it('reads native own-account originals without inventing a Genfeed source Post', async () => {
    const h = fixture();
    h.response.sourcePostId = null;
    h.response.nativeSourcePostId = 'native-a';
    const { postId: _postId, ...material } = source;
    vi.mocked(loadBreakoutPublication).mockResolvedValue({
      ...material,
      sourceKind: 'native_source_post',
      sourcePostId: 'native-a',
    });
    await h.service.generate(h.request);
    expect(h.prisma.post.findFirst).not.toHaveBeenCalled();
    expect(
      h.generation.generate.mock.calls[0]?.[0]?.input.originalPrompt,
    ).toContain('Actual imported original.');
  });
  it('propagates native denial before private reads and revocation during actual source loading', async () => {
    const h = fixture();
    vi.mocked(admitBreakoutGenerationContinuation).mockRejectedValueOnce(
      new Error('revoked'),
    );
    await expect(h.service.generate(h.request)).rejects.toThrow('revoked');
    expect(h.registry.validateModelForOrg).not.toHaveBeenCalled();
    h.prisma.post.findFirst.mockImplementationOnce(async () => {
      h.admission.reauthorize.mockRejectedValueOnce(new Error('key narrowed'));
      return h.post;
    });
    await expect(h.service.generate(h.request)).rejects.toThrow('key narrowed');
    expect(h.accounts.resolveDraft).not.toHaveBeenCalled();
    expect(h.generation.generate).not.toHaveBeenCalled();
  });
  it('holds a source changed while loading text and a disabled model before the actual consumer', async () => {
    const h = fixture();
    vi.mocked(loadBreakoutPublication)
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce({ ...source, contentDigest: 'edited' });
    await expect(h.service.generate(h.request)).rejects.toThrow(
      'breakout_source_changed',
    );
    h.registry.validateModelForOrg.mockResolvedValueOnce({
      key: h.request.textModelKey,
      category: ModelCategory.TEXT,
      isActive: false,
      isDeleted: false,
    });
    await expect(h.service.generate(h.request)).rejects.toThrow(
      'breakout_text_model_unavailable',
    );
    expect(h.generation.generate).not.toHaveBeenCalled();
  });
  it('continues checking current model availability through the actual consumer hook', async () => {
    const h = fixture();
    await h.service.generate(h.request);
    const prepared = h.generation.generate.mock.calls[0]?.[0];
    h.registry.validateModelForOrg.mockRejectedValueOnce(
      new Error('model removed'),
    );
    await expect(
      prepared?.admission.reauthorize(
        h.prisma as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow('model removed');
  });
  it('does not turn a live preview into an applied policy receipt', async () => {
    const h = fixture();
    h.learning.previewForContext.mockResolvedValueOnce({
      receipt: {
        mode: ContentLearningMode.LIVE,
        reason: 'experiment_assignment_unavailable',
        configVersion: 'rl-reward-v1-experimental',
        synthetic: false,
      },
      contribution: {},
    });
    await h.service.generate(h.request);
    expect(
      h.generation.generate.mock.calls[0]?.[0]?.privateLearning,
    ).toMatchObject({
      mode: 'live',
      application: {
        status: 'unavailable',
        privatePolicyApplied: false,
        sharedReleaseApplied: false,
      },
    });
  });
});
