import {
  BrandedTextActionsService,
  NO_BRAND_VOICE_HINT,
} from '@api/endpoints/ai-actions/branded-text-actions.service';
import type { TextActionRequestV1 } from '@api/endpoints/ai-actions/branded-text-actions.types';
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
  const openRouter = {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: '  Plain rewrite @ada https://a.co ' } }],
    }),
  };
  const logger = { error: vi.fn() };
  const service = new BrandedTextActionsService(
    branded as never,
    posts as never,
    {} as never,
    { resolveModelKey: vi.fn().mockResolvedValue('openai/mini-text') } as never,
    openRouter as never,
    logger as never,
  );
  return { branded, logger, openRouter, posts, service };
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
    expect(ctx.openRouter.chatCompletion).not.toHaveBeenCalled();
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
    expect(ctx.openRouter.chatCompletion).not.toHaveBeenCalled();
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

  describe('a brand with no approved voice', () => {
    beforeEach(() => {
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch: false,
        kind: 'stopped',
        postId: null,
        reasonCode: 'no_approved_revision',
        receipt: receipt({ state: 'blocked' }),
      });
    });

    it('edits once without voice context and says how to define one', async () => {
      const outcome = await ctx.service.run(request);

      expect(outcome).toEqual({
        hasNewDispatch: true,
        kind: 'completed',
        result: {
          hasBrandVoice: false,
          isReplayed: false,
          maxCharacters: 280,
          mode: 'rewrite',
          platform: 'twitter',
          text: 'Plain rewrite @ada https://a.co',
          voiceHint: NO_BRAND_VOICE_HINT,
        },
      });
      expect(ctx.openRouter.chatCompletion).toHaveBeenCalledOnce();
      const prompt = ctx.openRouter.chatCompletion.mock.calls[0][0].messages[0]
        .content as string;
      expect(prompt).toContain("author's own voice");
      expect(prompt).not.toContain('brand voice');
    });

    it('applies the same gate to the unbranded answer', async () => {
      ctx.openRouter.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Plain rewrite without the link' } }],
      });

      expect(await ctx.service.run(request)).toMatchObject({
        code: 'text_changed_meaning',
        kind: 'failed',
      });
    });

    it('reports an unavailable provider without throwing', async () => {
      ctx.openRouter.chatCompletion.mockRejectedValue(new Error('502'));

      expect(await ctx.service.run(request)).toMatchObject({
        code: 'provider_unavailable',
        kind: 'failed',
      });
      expect(ctx.logger.error).toHaveBeenCalledOnce();
    });
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
    expect(ctx.openRouter.chatCompletion).not.toHaveBeenCalled();
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
    expect(ctx.openRouter.chatCompletion).not.toHaveBeenCalled();
  });

  it('rejects an unknown platform before any model work', async () => {
    expect(
      await ctx.service.run({ ...request, platform: 'myspace' }),
    ).toMatchObject({ code: 'unsupported_platform', kind: 'failed' });
    expect(ctx.branded.generate).not.toHaveBeenCalled();
  });
});
