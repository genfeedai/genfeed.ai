import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  admitBreakoutGenerationContinuation,
  type BreakoutGenerationAdmission,
} from '@api/collections/outliers/services/breakout-generation-admission.util';
import { bindBreakoutPostArtifact } from '@api/collections/outliers/services/breakout-output-recovery.util';
import {
  type BreakoutTextOutputGenerationRequest,
  BreakoutTextOutputGenerationService,
} from '@api/collections/outliers/services/breakout-text-output-generation.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type {
  BrandedTextGenerationOutcomeV1,
  BrandedTextGenerationRequestV1,
} from '@api/services/branded-text-generation/branded-text-generation.types';
import type { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ByokProvider,
  CreditReservationStatus,
  Platform,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { GENERATE_CONTENT_TEXT_CREDITS } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-generation-admission.util',
  () => ({
    admitBreakoutGenerationContinuation: vi.fn(async () => undefined),
    runWithBreakoutGenerationAdmission: async <T>(
      _tx: unknown,
      _admission: unknown,
      run: () => Promise<T>,
    ) => run(),
  }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-output-recovery.util',
  () => ({
    bindBreakoutPostArtifact: vi.fn(async () => ({ status: 'bound' })),
  }),
);

function fixture(thread = false) {
  const reauthorize = vi.fn(async (_tx: Prisma.TransactionClient) => undefined);
  const admission: BreakoutGenerationAdmission = {
    scope: {
      version: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      strategyId: 'strategy-a',
      platform: Platform.TWITTER,
      format: thread ? 'thread' : 'text',
    },
    credentialId: 'account-a',
    responseId: 'response-a',
    outputId: 'output-a',
    actorUserId: 'user-a',
    workflowExecutionId: 'execution-a',
    componentKey: 'generation-a:caption',
    reauthorize,
  };
  const request: BreakoutTextOutputGenerationRequest = {
    admission,
    label: 'Follow-up',
    acceptSegment: (text) => text.length <= 280,
    input: {
      schemaVersion: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      actorId: 'user-a',
      requestKey: 'generation-a',
      candidateIndex: 0,
      surface: 'workflow',
      contentType: thread ? 'thread' : 'post',
      format: admission.scope.format,
      mode: 'approved_brand',
      originalPrompt: 'Make a useful original follow-up',
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      generationParameters: { maxTokens: 500, temperature: 0.8 },
      platform: Platform.TWITTER,
      destinationCredentialId: 'account-a',
      workflowExecutionId: 'execution-a',
      knowledgeSourceIds: [],
      knowledgeSpaceIds: [],
    },
    privateLearning:
      null as unknown as BrandedTextGenerationRequestV1['privateLearning'],
  };
  const tx = {
    breakoutResponseOutput: {
      findFirst: vi.fn(async () => ({ generationKey: 'generation-a' })),
    },
  } as unknown as Prisma.TransactionClient;
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => run(tx),
    ),
  };
  const posts = { create: vi.fn(async () => ({ id: 'post-a' })) };
  const credits = {
    reserveCredits: vi.fn(async () => ({
      id: 'hold-a',
      status: CreditReservationStatus.RESERVED,
    })),
    findReservationForWorkload: vi.fn(
      async (): Promise<{ id: string } | null> => null,
    ),
    settleReservation: vi.fn(async () => undefined),
  };
  const textCredits = {
    resolveDispatch: vi.fn<TextGenerationCreditsService['resolveDispatch']>(
      async () => undefined,
    ),
  };
  const receipt = {
    execution: { providerAttemptRef: 'openrouter:actual-1' },
  } as BrandedTextGenerationOutcomeV1['receipt'];
  const run = async (
    normal: BrandedTextGenerationRequestV1,
  ): Promise<BrandedTextGenerationOutcomeV1> => {
    await normal.resolveApiKey(normal.input.model);
    await normal.admitDispatch?.();
    const text = thread
      ? 'First segment\n\nSecond segment'
      : 'One useful follow-up';
    if (!normal.acceptText(text)) throw new Error('channel_limit');
    const { postId } = await normal.persistText(text);
    return { kind: 'completed', receipt, postId, text, hasNewDispatch: true };
  };
  const generation = { generate: vi.fn(run), generateThread: vi.fn(run) };
  const service = new BreakoutTextOutputGenerationService(
    prisma as unknown as PrismaService,
    generation as unknown as BrandedTextGenerationService,
    textCredits as unknown as TextGenerationCreditsService,
    credits as unknown as CreditsUtilsService,
    posts as unknown as PostsService,
  );
  return {
    service,
    request,
    reauthorize,
    prisma,
    tx,
    posts,
    credits,
    textCredits,
    generation,
    receipt,
  };
}

describe('breakout text provider consumer', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses the original actor, deterministic paid component and ordinary draft before binding quote lineage', async () => {
    const h = fixture();
    await h.service.generate(h.request);
    expect(h.credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: GENERATE_CONTENT_TEXT_CREDITS,
        actorUserId: 'user-a',
        brandId: 'brand-a',
        workloadId: 'generation-a:caption',
        idempotencyKey: 'generation:generation-a:caption',
      }),
    );
    expect(h.posts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        platform: Platform.TWITTER,
        credentialId: 'account-a',
        targetExecutionState: TargetExecutionState.DRAFT,
        ingredients: [],
      }),
      [],
    );
    expect(h.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'hold-a',
        actualAmount: GENERATE_CONTENT_TEXT_CREDITS,
        settlementIdempotencyKey: 'generation-a:caption:settled',
      }),
    );
    expect(bindBreakoutPostArtifact).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        responseId: 'response-a',
        outputId: 'output-a',
        postId: 'post-a',
      }),
    );
  });
  it('saves every accepted thread segment with the canonical root relationship', async () => {
    const h = fixture(true);
    await h.service.generate(h.request);
    expect(h.generation.generate).not.toHaveBeenCalled();
    expect(h.posts.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        format: PostFormat.THREAD,
        description: 'First segment',
        order: 0,
      }),
      [],
    );
    expect(h.posts.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        format: PostFormat.THREAD,
        description: 'Second segment',
        parentId: 'post-a',
        order: 1,
      }),
      [],
    );
  });
  it('uses one real BYOK resolution while retaining fresh growth admission and skipping a platform hold', async () => {
    const h = fixture();
    h.textCredits.resolveDispatch.mockResolvedValue({
      keys: { [ByokProvider.OPENROUTER]: 'fixture-private-key' },
    });
    await h.service.generate(h.request);
    expect(admitBreakoutGenerationContinuation).toHaveBeenCalled();
    expect(h.textCredits.resolveDispatch).toHaveBeenCalledOnce();
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
    expect(h.credits.settleReservation).not.toHaveBeenCalled();
  });
  it('never reissues a hold or provider call when the normal receipt is already in progress', async () => {
    const h = fixture();
    h.generation.generate.mockResolvedValue({
      kind: 'in_progress',
      receipt: { execution: null } as BrandedTextGenerationOutcomeV1['receipt'],
      hasNewDispatch: false,
    });
    await h.service.generate(h.request);
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
    expect(h.credits.settleReservation).not.toHaveBeenCalled();
    expect(h.posts.create).not.toHaveBeenCalled();
  });
  it('holds an expired/released price receipt without starting new provider work or creating a draft', async () => {
    const h = fixture();
    h.credits.reserveCredits.mockResolvedValue({
      id: 'hold-a',
      status: CreditReservationStatus.RELEASED,
    });
    await expect(h.service.generate(h.request)).rejects.toThrow(
      'hold_not_dispatchable',
    );
    expect(h.posts.create).not.toHaveBeenCalled();
    expect(h.credits.settleReservation).not.toHaveBeenCalled();
  });
  it('requires the exact persisted generation key and captured actor before private model/key reads', async () => {
    const h = fixture();
    h.request.input.actorId = 'creator-is-not-the-actor';
    await expect(h.service.generate(h.request)).rejects.toThrow(
      'request_scope_changed',
    );
    expect(h.textCredits.resolveDispatch).not.toHaveBeenCalled();
    expect(h.posts.create).not.toHaveBeenCalled();
  });
});
