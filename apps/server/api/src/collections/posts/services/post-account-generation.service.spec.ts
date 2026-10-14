vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAccountGenerationService } from '@api/collections/posts/services/post-account-generation.service';
import type { AccountGenerationFunding } from '@api/collections/posts/services/post-account-generation.types';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import {
  CredentialPlatform,
  Status,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { Prisma } from '@genfeedai/prisma';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationId = 'org-1';
const brandId = 'brand-1';
const userId = 'user-1';
const credentialId = 'cred-1';
const identity = { brandId, id: userId, organizationId, userId };

const context = {
  account: {
    handle: 'acct',
    id: credentialId,
    label: 'Acct',
    platform: CredentialPlatform.TWITTER,
  },
  brand: { id: brandId, label: 'Brand' },
  constraints: {
    maxWeightedCharacters: 280,
    notes: [],
    supportsThreads: true,
    usesWeightedCharacters: true,
  },
  promptHints: ['Account: Acct'],
};

type Doc = Record<string, unknown> & { id: string };

function receipt(
  id: string,
  overrides: Partial<{
    attempt: string | null;
    compliance: string;
    state: string;
  }> = {},
): BrandedGenerationReceiptV1 {
  return {
    compliance: overrides.compliance ?? 'unverified',
    execution:
      overrides.attempt === null
        ? null
        : { providerAttemptRef: overrides.attempt ?? `openrouter:${id}` },
    id,
    revision: 4,
    state: overrides.state ?? 'needs_review',
  } as unknown as BrandedGenerationReceiptV1;
}

describe('PostAccountGenerationService', () => {
  let store: Map<string, Doc>;
  let nextId: number;
  const accountContext = { resolve: vi.fn() };
  const activityRecorder = { record: vi.fn(), update: vi.fn() };
  const registry = { resolveModelKey: vi.fn() };
  const billing = {
    bindDispatch: vi.fn(),
    releaseDispatch: vi.fn(),
    releaseRun: vi.fn(),
    reserveRun: vi.fn(),
    settleDispatch: vi.fn(),
  };
  const modeResolver = { resolve: vi.fn() };
  const seam = { generate: vi.fn(), generateThread: vi.fn() };
  const learning = {
    bindArtifact: vi.fn(),
    resolve: vi.fn(),
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const postsService = {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    patchOneWhere: vi.fn(),
  };
  const lineage = { recordPostRemixLineage: vi.fn() };
  const websocket = { emit: vi.fn() };
  let service: PostAccountGenerationService;

  const funding = (
    overrides: Partial<AccountGenerationFunding> = {},
  ): AccountGenerationFunding => ({
    apiKey: undefined,
    creditsPerDispatch: 2,
    poolReservationId: 'pool-1',
    ...overrides,
  });

  /** Seam double: runs the hooks the real seam runs, then answers with `outcome`. */
  function seamAnswers(
    answer: (
      request: BrandedTextGenerationRequestV1,
      call: number,
    ) => Promise<'ok' | { stop: string; attempt?: string | null } | 'throw'>,
  ) {
    let call = 0;
    return async (request: BrandedTextGenerationRequestV1) => {
      const index = call++;
      await request.admitDispatch?.();
      const result = await answer(request, index);
      const id = `receipt-${request.input.requestKey}-${request.input.candidateIndex}`;
      if (result === 'throw')
        throw new HttpException('skill_context_unavailable', 503);
      if (result !== 'ok')
        return {
          hasNewDispatch: result.attempt !== null,
          kind: 'stopped' as const,
          postId: null,
          reasonCode: result.stop,
          receipt: receipt(id, {
            attempt:
              result.attempt === undefined
                ? `openrouter:${id}`
                : result.attempt,
            state: 'blocked',
          }),
        };
      const text =
        request.input.format === 'thread'
          ? 'Post one\n\nPost two\n\nPost three'
          : `Generated ${index}`;
      expect(request.acceptText(text)).toBe(true);
      const { postId } = await request.persistText(text);
      return {
        hasNewDispatch: true,
        kind: 'completed' as const,
        postId,
        receipt: receipt(id),
        text,
      };
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    seam.generate.mockReset();
    seam.generateThread.mockReset();
    store = new Map();
    nextId = 0;
    accountContext.resolve.mockResolvedValue(context);
    activityRecorder.record.mockResolvedValue({ id: 'activity-1' });
    activityRecorder.update.mockResolvedValue(undefined);
    registry.resolveModelKey.mockResolvedValue('openai/gpt-5-mini');
    modeResolver.resolve.mockResolvedValue({ mode: 'approved_brand' });
    billing.reserveRun.mockResolvedValue(funding());
    billing.bindDispatch.mockImplementation(
      async (_funding: unknown, _scope: unknown, key: string) => `hold:${key}`,
    );
    billing.settleDispatch.mockResolvedValue(undefined);
    billing.releaseDispatch.mockResolvedValue(undefined);
    billing.releaseRun.mockResolvedValue(undefined);
    learning.resolve.mockImplementation(
      async (_dto: unknown, posts: Doc[]) => ({
        decisionIds: posts.map(() => undefined),
        input: null,
        organizationId,
        receipts: posts.map(() => ({ mode: 'unavailable' })),
      }),
    );
    learning.bindArtifact.mockResolvedValue(undefined);
    lineage.recordPostRemixLineage.mockResolvedValue(undefined);
    websocket.emit.mockResolvedValue(undefined);
    postsService.create.mockImplementation(
      async (data: Record<string, unknown>) => {
        const doc = { ...data, id: `post-${++nextId}` } as Doc;
        store.set(doc.id, doc);
        return doc;
      },
    );
    postsService.patch.mockImplementation(
      async (id: string, data: Record<string, unknown>) => {
        const doc = { ...store.get(id), ...data, id } as Doc;
        store.set(id, doc);
        return doc;
      },
    );
    postsService.findOne.mockImplementation(
      async (where: { id: string }) => store.get(where.id) ?? null,
    );
    postsService.find.mockImplementation(
      async (where: { groupId?: string; parentId?: string }) =>
        [...store.values()].filter((doc) =>
          where.parentId
            ? doc.parentId === where.parentId
            : doc.groupId === where.groupId,
        ),
    );
    postsService.patchOneWhere.mockImplementation(
      async (
        where: { id: string; targetExecutionState: string },
        data: Record<string, unknown>,
      ) => {
        const doc = store.get(where.id);
        if (!doc || doc.targetExecutionState !== where.targetExecutionState)
          return null;
        const next = { ...doc, ...data } as Doc;
        store.set(where.id, next);
        return next;
      },
    );
    service = new PostAccountGenerationService(
      accountContext as never,
      activityRecorder as never,
      registry as never,
      billing as never,
      modeResolver as never,
      seam as never,
      learning as never,
      logger as never,
      postsService as never,
      lineage as never,
      websocket as never,
    );
  });

  interface RunInput {
    count: number;
    credentialId: string;
    format: 'post' | 'thread';
    topic: string;
  }
  const dto: RunInput = {
    count: 3,
    credentialId,
    format: 'post',
    topic: 'AI technology',
  };

  async function run(
    overrides: Partial<RunInput> = {},
  ): Promise<{ posts: PostDocument[] }> {
    const input = { ...dto, ...overrides };
    // `start` runs the background work detached; the spy lets the test await it.
    const execute = vi.spyOn(service, 'execute');
    const posts = await service.start(input, identity);
    await execute.mock.results[0]?.value;
    return { posts };
  }

  describe('start', () => {
    it('refuses with the funding error before any placeholder or dispatch exists', async () => {
      billing.reserveRun.mockRejectedValueOnce(
        new HttpException('Insufficient credits', HttpStatus.PAYMENT_REQUIRED),
      );

      await expect(service.start(dto, identity)).rejects.toMatchObject({
        status: HttpStatus.PAYMENT_REQUIRED,
      });
      expect(postsService.create).not.toHaveBeenCalled();
      expect(seam.generate).not.toHaveBeenCalled();
    });

    it('takes ONE hold covering every dispatch of the run', async () => {
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));

      await run();

      expect(billing.reserveRun).toHaveBeenCalledTimes(1);
      expect(billing.reserveRun).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchCount: 3,
          model: 'openai/gpt-5-mini',
        }),
      );
    });

    it('reserves a single dispatch for a thread, whatever its length', async () => {
      seam.generateThread.mockImplementation(seamAnswers(async () => 'ok'));

      await run({ count: 3, format: 'thread' });

      expect(billing.reserveRun).toHaveBeenCalledWith(
        expect.objectContaining({ dispatchCount: 1 }),
      );
    });

    it('refuses a model that cannot dispatch through the seam, with nothing held', async () => {
      registry.resolveModelKey.mockResolvedValueOnce('replicate/some-model');

      await expect(service.start(dto, identity)).rejects.toMatchObject({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
      expect(billing.reserveRun).not.toHaveBeenCalled();
    });

    it('returns the hold when the placeholders cannot be created', async () => {
      postsService.create.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.start(dto, identity)).rejects.toThrow('DB error');
      expect(billing.releaseRun).toHaveBeenCalledTimes(1);
      expect(seam.generate).not.toHaveBeenCalled();
    });

    it('creates tagged placeholders sharing the run id as their group', async () => {
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));

      const { posts } = await run();

      expect(posts).toHaveLength(3);
      const groups = new Set(
        postsService.create.mock.calls.map(([data]) => data.groupId),
      );
      expect(groups.size).toBe(1);
      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Generating...',
          platform: CredentialPlatform.TWITTER,
          promptUsed: expect.stringContaining('post 1 of 3'),
          source: 'account-generation',
          targetExecutionState: TargetExecutionState.PUBLISHING,
        }),
      );
    });
  });

  describe('post runs', () => {
    it('makes one branded dispatch per post under one batch id, in order', async () => {
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));

      const { posts } = await run();

      const requests = seam.generate.mock.calls.map(
        ([request]) => request as BrandedTextGenerationRequestV1,
      );
      expect(requests).toHaveLength(3);
      expect(requests.map((request) => request.input.candidateIndex)).toEqual([
        0, 1, 2,
      ]);
      const groupId = String(posts[0].groupId);
      for (const request of requests) {
        expect(request.input).toMatchObject({
          brandId,
          contentType: 'post',
          format: 'text',
          mode: 'approved_brand',
          requestKey: groupId,
          runId: groupId,
          surface: 'api',
        });
        expect(request.input.parentRequestId).toBeUndefined();
      }
      expect(seam.generateThread).not.toHaveBeenCalled();
    });

    it('carries the provisional draft revision into every dispatch', async () => {
      modeResolver.resolve.mockResolvedValue({
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
      });
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));

      await run();

      for (const [request] of seam.generate.mock.calls)
        expect(request.input).toMatchObject({
          draftRevisionId: 'draft-1',
          mode: 'provisional_brand',
        });
    });

    it('patches each placeholder with its text, receipt id and receipt state as its dispatch finishes', async () => {
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));

      const { posts } = await run();

      for (const [index, post] of posts.entries())
        expect(store.get(String(post.id))).toMatchObject({
          brandedReceiptId: `receipt-${posts[0].groupId}-${index}`,
          brandedReceiptState: 'needs_review',
          description: `Generated ${index}`,
          targetExecutionState: TargetExecutionState.DRAFT,
        });
      expect(websocket.emit).toHaveBeenCalledWith(
        expect.stringContaining(String(posts[0].id)),
        expect.objectContaining({
          brandedReceipt: expect.objectContaining({
            compliance: 'unverified',
            state: 'needs_review',
          }),
          status: Status.COMPLETED,
        }),
      );
    });

    it('tells later dispatches what the run already wrote', async () => {
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));

      await run();

      const prompts = seam.generate.mock.calls.map(
        ([request]) => request.input.originalPrompt as string,
      );
      expect(prompts[0]).not.toContain('Already written');
      expect(prompts[2]).toContain('Generated 0');
      expect(prompts[2]).toContain('Generated 1');
    });

    it('carves a hold per dispatch and charges only dispatches the provider accepted', async () => {
      seam.generate.mockImplementation(
        seamAnswers(async (_request, call) =>
          call === 1 ? { attempt: null, stop: 'no_approved_revision' } : 'ok',
        ),
      );

      const { posts } = await run();

      const key = (index: number) => `${posts[0].groupId}:${index}`;
      expect(billing.bindDispatch).toHaveBeenCalledTimes(3);
      expect(billing.settleDispatch).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `hold:${key(0)}`,
        key(0),
      );
      expect(billing.settleDispatch).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `hold:${key(2)}`,
        key(2),
      );
      // The stopped dispatch never reached the provider, so its hold goes back.
      expect(billing.releaseDispatch).toHaveBeenCalledWith(
        expect.anything(),
        `hold:${key(1)}`,
      );
      expect(billing.settleDispatch).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `hold:${key(1)}`,
        key(1),
      );
      expect(billing.releaseRun).toHaveBeenCalledTimes(1);
    });

    it('charges a stopped dispatch that recorded a provider attempt', async () => {
      seam.generate.mockImplementation(
        seamAnswers(async (_request, call) =>
          call === 0 ? { stop: 'channel_limit_exceeded' } : 'ok',
        ),
      );

      const { posts } = await run({ count: 2 });

      expect(billing.settleDispatch).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `hold:${posts[0].groupId}:0`,
        `${posts[0].groupId}:0`,
      );
      expect(billing.releaseDispatch).not.toHaveBeenCalled();
    });

    it('lets the other posts continue when one dispatch fails, and shows its reason', async () => {
      seam.generate.mockImplementation(
        seamAnswers(async (_request, call) =>
          call === 1 ? { stop: 'channel_limit_exceeded' } : 'ok',
        ),
      );

      const { posts } = await run();

      expect(seam.generate).toHaveBeenCalledTimes(3);
      expect(store.get(String(posts[0].id))).toMatchObject({
        targetExecutionState: TargetExecutionState.DRAFT,
      });
      expect(store.get(String(posts[2].id))).toMatchObject({
        targetExecutionState: TargetExecutionState.DRAFT,
      });
      expect(store.get(String(posts[1].id))).toMatchObject({
        brandedReceiptId: `receipt-${posts[0].groupId}-1`,
        brandedReceiptState: 'blocked',
        targetError: expect.objectContaining({
          code: 'channel_limit_exceeded',
          isRetryable: true,
          message: expect.stringContaining('limits'),
        }),
        targetExecutionState: TargetExecutionState.FAILED,
      });
      expect(websocket.emit).toHaveBeenCalledWith(
        expect.stringContaining(String(posts[1].id)),
        expect.objectContaining({
          reasonCode: 'channel_limit_exceeded',
          status: Status.FAILED,
        }),
      );
      expect(activityRecorder.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          value: expect.stringContaining('"completedCount":2'),
        }),
      );
    });

    it('fails only its own post on a thrown seam error and never charges it', async () => {
      seam.generate.mockImplementation(
        seamAnswers(async (_request, call) => (call === 0 ? 'throw' : 'ok')),
      );

      const { posts } = await run({ count: 2 });

      expect(store.get(String(posts[0].id))).toMatchObject({
        targetError: expect.objectContaining({
          code: 'skill_context_unavailable',
        }),
        targetExecutionState: TargetExecutionState.FAILED,
      });
      expect(store.get(String(posts[1].id))).toMatchObject({
        targetExecutionState: TargetExecutionState.DRAFT,
      });
      expect(billing.settleDispatch).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `hold:${posts[0].groupId}:0`,
        expect.anything(),
      );
    });

    it('uses the org own key and the single hold-free path for BYOK runs', async () => {
      billing.reserveRun.mockResolvedValue(
        funding({
          apiKey: 'byok-key',
          creditsPerDispatch: 0,
          poolReservationId: null,
        }),
      );
      billing.bindDispatch.mockResolvedValue(null);
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));

      await run({ count: 1 });

      const [request] = seam.generate.mock.calls[0];
      await expect(request.resolveApiKey('openai/gpt-5-mini')).resolves.toBe(
        'byok-key',
      );
      expect(billing.settleDispatch).not.toHaveBeenCalled();
    });

    it('marks every placeholder failed and still returns the hold when the run cannot start', async () => {
      activityRecorder.record.mockRejectedValueOnce(new Error('activity down'));

      const { posts } = await run();

      for (const post of posts)
        expect(store.get(String(post.id))).toMatchObject({
          targetExecutionState: TargetExecutionState.FAILED,
        });
      expect(seam.generate).not.toHaveBeenCalled();
      expect(billing.releaseRun).toHaveBeenCalledTimes(1);
    });

    it('records remix lineage and binds the learning decision of a completed post', async () => {
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));
      const execute = vi.spyOn(service, 'execute');
      await service.start(
        { ...dto, count: 1, trendId: 'trend-1' } as never,
        identity,
      );
      await execute.mock.results[0]?.value;

      expect(lineage.recordPostRemixLineage).toHaveBeenCalledWith(
        expect.objectContaining({
          draftType: 'tweet',
          metadata: expect.objectContaining({ trendId: 'trend-1' }),
        }),
      );
      expect(learning.bindArtifact).toHaveBeenCalledTimes(1);
    });
  });

  describe('thread runs', () => {
    it('makes one dispatch whose receipt binds the whole thread', async () => {
      seam.generateThread.mockImplementation(seamAnswers(async () => 'ok'));

      const { posts } = await run({ count: 3, format: 'thread' });

      expect(seam.generate).not.toHaveBeenCalled();
      expect(seam.generateThread).toHaveBeenCalledTimes(1);
      const [request] = seam.generateThread.mock.calls[0];
      expect(request.input).toMatchObject({
        candidateIndex: 0,
        contentType: 'thread',
        format: 'thread',
        runId: String(posts[0].groupId),
      });
      expect(
        posts.map((post) => store.get(String(post.id))?.description),
      ).toEqual(['Post one', 'Post two', 'Post three']);
      for (const post of posts)
        expect(store.get(String(post.id))).toMatchObject({
          brandedReceiptState: 'needs_review',
          targetExecutionState: TargetExecutionState.DRAFT,
        });
    });

    it('accepts only a thread with exactly the requested posts', async () => {
      seam.generateThread.mockImplementation(async (request) => {
        expect(request.acceptText('One\n\nTwo')).toBe(false);
        expect(request.acceptText('One\n\nTwo\n\nThree')).toBe(true);
        expect(request.acceptText('One\n\nTwo\n\nThree\n\nFour')).toBe(false);
        return {
          hasNewDispatch: false,
          kind: 'stopped',
          postId: null,
          reasonCode: 'channel_limit_exceeded',
          receipt: receipt('r', { attempt: null, state: 'failed' }),
        };
      });

      const { posts } = await run({ count: 3, format: 'thread' });

      for (const post of posts)
        expect(store.get(String(post.id))).toMatchObject({
          targetExecutionState: TargetExecutionState.FAILED,
        });
    });
  });

  describe('retry', () => {
    const requestKey = '7b1f6a3e-2c54-4d0e-9a8b-3f1c2d4e5a60';

    async function failedRun(overrides: Parameters<typeof run>[0] = {}) {
      seam.generate.mockImplementation(
        seamAnswers(async (_request, call) =>
          call === 1 ? { stop: 'channel_limit_exceeded' } : 'ok',
        ),
      );
      if (overrides.format === 'thread')
        seam.generateThread.mockImplementationOnce(async () => ({
          hasNewDispatch: false,
          kind: 'stopped',
          postId: null,
          reasonCode: 'provider_output_empty',
          receipt: receipt('r', { attempt: null, state: 'failed' }),
        }));
      const { posts } = await run(overrides);
      vi.clearAllMocks();
      billing.reserveRun.mockResolvedValue(
        funding({ poolReservationId: 'pool-2' }),
      );
      billing.bindDispatch.mockImplementation(
        async (_f: unknown, _s: unknown, key: string) => `hold:${key}`,
      );
      return posts;
    }

    async function retryAndSettle(postId: string) {
      const claimed = await service.retry(postId, requestKey, identity);
      // The retry's dispatch runs detached; flush its microtasks.
      await vi.waitFor(() => expect(billing.releaseRun).toHaveBeenCalled());
      return claimed;
    }

    it('re-dispatches the failed post under the new request key, linked to the run', async () => {
      const posts = await failedRun();
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));
      const groupId = String(posts[0].groupId);

      const claimed = await retryAndSettle(String(posts[1].id));

      expect(claimed).toMatchObject({
        id: posts[1].id,
        targetExecutionState: TargetExecutionState.PUBLISHING,
      });
      expect(billing.reserveRun).toHaveBeenCalledWith(
        expect.objectContaining({ dispatchCount: 1, runId: requestKey }),
      );
      const [request] = seam.generate.mock.calls[0];
      expect(request.input).toMatchObject({
        candidateIndex: 0,
        parentRequestId: groupId,
        requestKey,
        runId: groupId,
      });
      expect(request.input.originalPrompt).toContain('post 2 of 3');
      expect(request.input.originalPrompt).toContain('Generated 0');
      expect(store.get(String(posts[1].id))).toMatchObject({
        brandedReceiptId: `receipt-${requestKey}-0`,
        targetExecutionState: TargetExecutionState.DRAFT,
      });
      expect(store.get(String(posts[1].id))?.targetError).toEqual(
        Prisma.JsonNull,
      );
      expect(seam.generate).toHaveBeenCalledTimes(1);
    });

    it('clears the stopped reason when it claims the placeholder', async () => {
      const posts = await failedRun();
      seam.generate.mockImplementation(seamAnswers(async () => 'ok'));

      await retryAndSettle(String(posts[1].id));

      expect(postsService.patchOneWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          id: posts[1].id,
          organizationId,
          targetExecutionState: TargetExecutionState.FAILED,
        }),
        expect.objectContaining({ targetError: Prisma.JsonNull }),
        expect.anything(),
      );
    });

    it('retries a whole thread from any of its failed posts', async () => {
      const posts = await failedRun({ count: 3, format: 'thread' });
      seam.generateThread.mockImplementation(seamAnswers(async () => 'ok'));

      await retryAndSettle(String(posts[2].id));

      expect(seam.generateThread).toHaveBeenCalledTimes(1);
      const [request] = seam.generateThread.mock.calls[0];
      expect(request.input).toMatchObject({ format: 'thread', requestKey });
      for (const post of posts)
        expect(store.get(String(post.id))).toMatchObject({
          targetExecutionState: TargetExecutionState.DRAFT,
        });
    });

    it('refuses a post that is not a failed account-generation placeholder', async () => {
      const posts = await failedRun();

      await expect(
        service.retry(String(posts[0].id), requestKey, identity),
      ).rejects.toMatchObject({ message: 'account_generation_not_retryable' });

      store.set('foreign', {
        id: 'foreign',
        source: 'manual',
        targetExecutionState: TargetExecutionState.FAILED,
      });
      await expect(
        service.retry('foreign', requestKey, identity),
      ).rejects.toMatchObject({ message: 'account_generation_not_retryable' });
      expect(billing.reserveRun).not.toHaveBeenCalled();
    });

    it('returns the hold when another request already claimed the placeholder', async () => {
      const posts = await failedRun();
      postsService.patchOneWhere.mockResolvedValueOnce(null);

      await expect(
        service.retry(String(posts[1].id), requestKey, identity),
      ).rejects.toMatchObject({ message: 'account_generation_claimed' });
      expect(billing.releaseRun).toHaveBeenCalledTimes(1);
      expect(seam.generate).not.toHaveBeenCalled();
    });

    it('refuses with the funding error before claiming anything', async () => {
      const posts = await failedRun();
      billing.reserveRun.mockRejectedValueOnce(
        new HttpException('Insufficient credits', HttpStatus.PAYMENT_REQUIRED),
      );

      await expect(
        service.retry(String(posts[1].id), requestKey, identity),
      ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });
      expect(postsService.patchOneWhere).not.toHaveBeenCalled();
    });

    it('keeps the original hold when the retry key is still in progress elsewhere', async () => {
      const posts = await failedRun();
      seam.generate.mockImplementation(async () => ({
        hasNewDispatch: false,
        kind: 'in_progress',
        receipt: receipt('r', { state: 'dispatched' }),
      }));

      await service.retry(String(posts[1].id), requestKey, identity);
      await vi.waitFor(() => expect(seam.generate).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(billing.releaseRun).not.toHaveBeenCalled();
      expect(store.get(String(posts[1].id))).toMatchObject({
        targetExecutionState: TargetExecutionState.PUBLISHING,
      });
    });
  });
});
