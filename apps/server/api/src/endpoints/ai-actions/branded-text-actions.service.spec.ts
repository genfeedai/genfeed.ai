import { BrandedTextActionsService } from '@api/endpoints/ai-actions/branded-text-actions.service';
import type {
  ReplyVariantsRequestV1,
  TextActionRequestV1,
} from '@api/endpoints/ai-actions/branded-text-actions.types';
import { BrandedTextRunnerService } from '@api/endpoints/ai-actions/branded-text-runner.service';
import { MissingProviderKeyException } from '@api/helpers/exceptions/missing-provider-key/missing-provider-key.exception';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { TargetExecutionState } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestKey = '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c';
const learningReceipt = { mode: 'no_destination' };

vi.mock(
  '@api/services/branded-text-generation/accountless-learning-receipt.util',
  () => ({
    resolveAccountlessLearningReceipt: vi
      .fn()
      .mockImplementation(async () => learningReceipt),
  }),
);

const request: TextActionRequestV1 = {
  actor: { organizationId: 'org-1', userId: 'user-1' },
  brandId: 'brand-1',
  mode: 'rewrite',
  platform: 'twitter',
  requestKey,
  text: 'Launch day @ada https://a.co',
};

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    artifact: { version: hashBrandedGenerationTextV1('Saved text') },
    compliance: 'passed',
    id: 'receipt-1',
    state: 'ready',
    ...overrides,
  };
}

function createService() {
  const branded = { generate: vi.fn() };
  const posts = {
    create: vi.fn().mockResolvedValue({ id: 'post-1' }),
    findOne: vi.fn().mockResolvedValue({ description: 'Saved text' }),
  };
  const modeResolver = {
    resolve: vi.fn().mockResolvedValue({ mode: 'approved_brand' }),
  };
  const service = new BrandedTextActionsService(
    new BrandedTextRunnerService(
      branded as never,
      modeResolver as never,
      posts as never,
      {} as never,
      {
        resolveModelKey: vi.fn().mockResolvedValue('openai/mini-text'),
      } as never,
    ),
  );
  return { branded, modeResolver, posts, service };
}

describe('BrandedTextActionsService', () => {
  let ctx: ReturnType<typeof createService>;

  beforeEach(() => {
    ctx = createService();
  });

  it('runs the approved-brand seam with the request identity and the draft fenced as data', async () => {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: true,
      kind: 'completed',
      postId: 'post-1',
      receipt: receipt(),
      text: 'Fresh rewrite @ada https://a.co',
    });

    const outcome = await ctx.service.run(request);

    expect(outcome).toEqual({
      hasNewDispatch: true,
      kind: 'completed',
      result: {
        hasBrandVoice: true,
        isReplayed: false,
        maxCharacters: 280,
        mode: 'rewrite',
        platform: 'twitter',
        receiptId: 'receipt-1',
        receiptState: 'ready',
        text: 'Fresh rewrite @ada https://a.co',
      },
    });
    const seam = ctx.branded.generate.mock
      .calls[0][0] as BrandedTextGenerationRequestV1;
    expect(seam.initiatingActor).toBe(request.actor);
    expect(seam.privateLearning).toBe(learningReceipt);
    expect(seam.input).toMatchObject({
      actorId: 'user-1',
      brandId: 'brand-1',
      candidateIndex: 0,
      contentType: 'post',
      format: 'text',
      mode: 'approved_brand',
      model: 'openai/mini-text',
      organizationId: 'org-1',
      platform: 'twitter',
      provider: 'openrouter',
      requestKey,
      surface: 'agent',
    });
    expect(seam.input.originalPrompt).toContain(
      '<draft>\nLaunch day @ada https://a.co\n</draft>',
    );
    expect(await seam.resolveApiKey('openai/mini-text')).toBeUndefined();
    expect(ctx.modeResolver.resolve).toHaveBeenCalledExactlyOnceWith(
      request.actor,
      'brand-1',
    );
  });

  it('gates the provider answer on the channel limit and kept mentions and links', async () => {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: true,
      kind: 'completed',
      postId: 'post-1',
      receipt: receipt(),
      text: 'Fresh',
    });
    await ctx.service.run(request);
    const seam = ctx.branded.generate.mock
      .calls[0][0] as BrandedTextGenerationRequestV1;

    expect(seam.acceptText('Fresh take @ada https://a.co')).toBe(true);
    expect(seam.acceptText('Fresh take @ada')).toBe(false);
    expect(seam.acceptText(`@ada https://a.co ${'x'.repeat(280)}`)).toBe(false);
  });

  it('saves the exact accepted text as a draft bound to the request', async () => {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: true,
      kind: 'completed',
      postId: 'post-1',
      receipt: receipt(),
      text: 'Fresh',
    });
    await ctx.service.run(request);
    const seam = ctx.branded.generate.mock
      .calls[0][0] as BrandedTextGenerationRequestV1;

    await expect(seam.persistText('Fresh take')).resolves.toEqual({
      postId: 'post-1',
    });
    expect(ctx.posts.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        brandId: 'brand-1',
        description: 'Fresh take',
        organizationId: 'org-1',
        platform: 'twitter',
        sourceActionId: requestKey,
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: 'user-1',
      }),
    );
  });

  it('keeps a proofread of an over-long X draft within the room it already uses', async () => {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: true,
      kind: 'completed',
      postId: 'post-1',
      receipt: receipt(),
      text: 'x',
    });

    const outcome = await ctx.service.run({
      ...request,
      mode: 'proofread',
      text: 'y'.repeat(400),
    });

    expect(outcome).toMatchObject({ result: { maxCharacters: 420 } });
    const seam = ctx.branded.generate.mock
      .calls[0][0] as BrandedTextGenerationRequestV1;
    expect(seam.input.generationParameters).toMatchObject({ temperature: 0.2 });
  });

  it('answers a replay from the saved draft while it still holds the receipt text', async () => {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: false,
      kind: 'completed',
      postId: 'post-1',
      receipt: receipt(),
      text: null,
    });

    const outcome = await ctx.service.run(request);

    expect(outcome).toMatchObject({
      hasNewDispatch: false,
      kind: 'completed',
      result: { isReplayed: true, text: 'Saved text' },
    });
    expect(ctx.posts.findOne).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        id: 'post-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
      'none',
    );
  });

  it('refuses a replay whose saved draft no longer matches the receipt', async () => {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: false,
      kind: 'completed',
      postId: 'post-1',
      receipt: receipt(),
      text: null,
    });
    ctx.posts.findOne.mockResolvedValue({ description: 'Edited later' });

    expect(await ctx.service.run(request)).toMatchObject({
      code: 'blocked',
      kind: 'failed',
      reasonCode: 'receipt_artifact_not_found',
    });
  });

  describe('a brand with no approved kit', () => {
    beforeEach(() => {
      ctx.modeResolver.resolve.mockResolvedValue({
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
      });
    });

    it('runs the seam on the provisional draft and reports the review state', async () => {
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch: true,
        kind: 'completed',
        postId: 'post-1',
        receipt: receipt({ state: 'needs_review' }),
        text: 'Fresh rewrite @ada https://a.co',
      });

      const outcome = await ctx.service.run(request);

      expect(outcome).toMatchObject({
        hasNewDispatch: true,
        kind: 'completed',
        result: { receiptId: 'receipt-1', receiptState: 'needs_review' },
      });
      const seam = ctx.branded.generate.mock
        .calls[0][0] as BrandedTextGenerationRequestV1;
      expect(seam.input).toMatchObject({
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
        surface: 'agent',
      });
    });

    it('stops with the receipt and the reason when the seam cannot use the draft', async () => {
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch: false,
        kind: 'stopped',
        postId: null,
        reasonCode: 'no_draft_revision',
        receipt: receipt({ id: 'receipt-4', state: 'blocked' }),
      });

      expect(await ctx.service.run(request)).toEqual({
        code: 'blocked',
        kind: 'failed',
        message:
          'Your brand voice could not be applied (no_draft_revision). Nothing was written.',
        reasonCode: 'no_draft_revision',
        receiptId: 'receipt-4',
      });
    });
  });

  it('does not call the seam when the mode cannot be resolved', async () => {
    ctx.modeResolver.resolve.mockRejectedValue(
      new Error('Brand access denied'),
    );

    await expect(ctx.service.run(request)).rejects.toThrow(
      'Brand access denied',
    );
    expect(ctx.branded.generate).not.toHaveBeenCalled();
  });

  it('never falls back to an unbranded call for any other stop', async () => {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: false,
      kind: 'stopped',
      postId: null,
      reasonCode: 'unsupported_capability',
      receipt: receipt({ id: 'receipt-9', state: 'blocked' }),
    });

    expect(await ctx.service.run(request)).toEqual({
      code: 'blocked',
      kind: 'failed',
      message:
        'Your brand voice could not be applied (unsupported_capability). Nothing was written.',
      reasonCode: 'unsupported_capability',
      receiptId: 'receipt-9',
    });
  });

  it('turns a gate rejection recorded on the receipt into the limit message', async () => {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: true,
      kind: 'stopped',
      postId: null,
      reasonCode: 'channel_limit_exceeded',
      receipt: receipt({ state: 'failed' }),
    });

    expect(await ctx.service.run(request)).toEqual({
      code: 'limit_exceeded',
      kind: 'failed',
      message: 'The result did not fit the 280-character limit. Try again.',
      receiptId: 'receipt-1',
    });
  });

  it.each([
    'provider_output_empty',
    'provider_attempt_ref_unavailable',
    'artifact_persist_failed',
    'artifact_bind_failed',
  ])(
    'maps the stopped receipt reason %s to a retryable failure',
    async (reasonCode) => {
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch: true,
        kind: 'stopped',
        postId: null,
        reasonCode,
        receipt: receipt({ state: 'failed' }),
      });

      expect(await ctx.service.run(request)).toMatchObject({
        code: 'provider_unavailable',
        kind: 'failed',
        reasonCode,
        receiptId: 'receipt-1',
      });
    },
  );

  it('names the missing provider key instead of a generic retryable failure', async () => {
    ctx.branded.generate.mockRejectedValue(
      new MissingProviderKeyException('OpenRouter', 'OPENROUTER_API_KEY'),
    );

    expect(await ctx.service.run(request)).toEqual({
      code: 'provider_unavailable',
      kind: 'failed',
      message:
        'Missing provider key: OPENROUTER_API_KEY. Add it to the server environment, then try again.',
      reasonCode: 'missing_provider_key',
    });
  });

  it('rethrows unrelated seam errors', async () => {
    ctx.branded.generate.mockRejectedValue(new Error('database down'));

    await expect(ctx.service.run(request)).rejects.toThrow('database down');
  });

  it('tells an in-flight repeat to wait instead of dispatching again', async () => {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: false,
      kind: 'in_progress',
      receipt: receipt({ state: 'dispatched' }),
    });

    expect(await ctx.service.run(request)).toMatchObject({
      code: 'in_progress',
      kind: 'failed',
      receiptId: 'receipt-1',
    });
  });

  it('rejects an unknown platform before any model work', async () => {
    expect(
      await ctx.service.run({ ...request, platform: 'myspace' }),
    ).toMatchObject({ code: 'unsupported_platform', kind: 'failed' });
    expect(ctx.branded.generate).not.toHaveBeenCalled();
  });

  describe('draftReplyVariants', () => {
    const reply: ReplyVariantsRequestV1 = {
      actor: request.actor,
      brandId: 'brand-1',
      platform: 'twitter',
      postAuthor: '@ada',
      postContent: 'We just launched our public API.',
      requestKey,
      tone: 'add-value',
      variants: 3,
    };

    function seamOf(): BrandedTextGenerationRequestV1 {
      return ctx.branded.generate.mock
        .calls[0][0] as BrandedTextGenerationRequestV1;
    }

    function completed(text: string | null, hasNewDispatch = true) {
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch,
        kind: 'completed',
        postId: 'post-1',
        receipt: receipt(),
        text,
      });
    }

    it('asks the seam for a reply set with the real post, author and tone', async () => {
      completed('One\n---\nTwo\n---\nThree');

      await ctx.service.draftReplyVariants(reply);

      const seam = seamOf();
      expect(seam.input).toMatchObject({
        brandId: 'brand-1',
        candidateIndex: 0,
        contentType: 'reply',
        format: 'text',
        mode: 'approved_brand',
        platform: 'twitter',
        requestKey,
        surface: 'agent',
      });
      expect(seam.input.generationParameters).toMatchObject({
        temperature: 0.9,
      });
      const prompt = seam.input.originalPrompt;
      expect(prompt).toContain(
        'Write 3 distinct replies to the X (Twitter) post',
      );
      expect(prompt).toContain('add something the post does not already say');
      expect(prompt).toContain('The post was written by @ada.');
      expect(prompt).toContain('at most 280 characters');
      expect(prompt).toContain(
        '<post>\nWe just launched our public API.\n</post>',
      );
    });

    it('returns the distinct variants the seam saved', async () => {
      completed('Great launch!\n---\nWhat about rate limits?\n---\nNice docs');

      expect(await ctx.service.draftReplyVariants(reply)).toEqual({
        hasNewDispatch: true,
        kind: 'completed',
        result: {
          hasBrandVoice: true,
          isReplayed: false,
          maxCharacters: 280,
          platform: 'twitter',
          receiptId: 'receipt-1',
          receiptState: 'ready',
          tone: 'add-value',
          variants: ['Great launch!', 'What about rate limits?', 'Nice docs'],
        },
      });
    });

    it('saves the normalized variants as the receipt artifact and accepts what survives the gate', async () => {
      completed('x');
      await ctx.service.draftReplyVariants(reply);
      const seam = seamOf();
      const raw =
        '1. "Great launch!"\n---\ngreat launch\n---\n' +
        `${'word '.repeat(80)}\n---\nFour\n---\nFive`;

      expect(seam.acceptText(raw)).toBe(true);
      await seam.persistText(raw);

      const saved = ctx.posts.create.mock.calls[0][0].description as string;
      const variants = saved.split('\n---\n');
      expect(variants).toHaveLength(3);
      expect(variants[0]).toBe('Great launch!');
      expect(variants[1].length).toBeLessThanOrEqual(280);
      expect(variants[1].endsWith('…')).toBe(true);
      expect(variants[2]).toBe('Four');
      expect(ctx.posts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Extension reply options',
          sourceActionId: requestKey,
        }),
      );
      expect(seam.acceptText('---\n---')).toBe(false);
    });

    it.each([
      ['tiktok', 150],
      ['linkedin', 1250],
      ['reddit', 10_000],
      ['youtube', 10_000],
      ['facebook', 8000],
      ['instagram', 2200],
    ])(
      'holds %s replies to its comment limit of %i',
      async (platform, limit) => {
        completed('One');

        const outcome = await ctx.service.draftReplyVariants({
          ...reply,
          platform,
        });

        expect(outcome).toMatchObject({ result: { maxCharacters: limit } });
        expect(seamOf().input.originalPrompt).toContain(
          `at most ${limit} characters`,
        );
      },
    );

    it('answers a replay from the saved variants without a new dispatch', async () => {
      ctx.posts.findOne.mockResolvedValue({
        description: 'Saved one\n---\nSaved two',
      });
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch: false,
        kind: 'completed',
        postId: 'post-1',
        receipt: receipt({
          artifact: {
            version: hashBrandedGenerationTextV1('Saved one\n---\nSaved two'),
          },
        }),
        text: null,
      });

      expect(await ctx.service.draftReplyVariants(reply)).toMatchObject({
        hasNewDispatch: false,
        result: { isReplayed: true, variants: ['Saved one', 'Saved two'] },
      });
    });

    it('writes the replies on the provisional draft with a review receipt', async () => {
      ctx.modeResolver.resolve.mockResolvedValue({
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
      });
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch: true,
        kind: 'completed',
        postId: 'post-1',
        receipt: receipt({ state: 'needs_review' }),
        text: 'Plain one\n---\nPlain two',
      });

      expect(await ctx.service.draftReplyVariants(reply)).toMatchObject({
        hasNewDispatch: true,
        kind: 'completed',
        result: {
          receiptId: 'receipt-1',
          receiptState: 'needs_review',
          variants: ['Plain one', 'Plain two'],
        },
      });
      expect(seamOf().input).toMatchObject({
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
      });
    });

    it('reports an answer with no usable reply', async () => {
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch: true,
        kind: 'stopped',
        postId: null,
        reasonCode: 'channel_limit_exceeded',
        receipt: receipt({ state: 'failed' }),
      });

      expect(await ctx.service.draftReplyVariants(reply)).toEqual({
        code: 'no_usable_reply',
        kind: 'failed',
        message: 'The model gave no usable reply. Try again.',
        receiptId: 'receipt-1',
      });
    });

    it('rejects an unknown platform before any model work', async () => {
      expect(
        await ctx.service.draftReplyVariants({ ...reply, platform: 'myspace' }),
      ).toMatchObject({ code: 'unsupported_platform', kind: 'failed' });
      expect(ctx.branded.generate).not.toHaveBeenCalled();
    });
  });
});
