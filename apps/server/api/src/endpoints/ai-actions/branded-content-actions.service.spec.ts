import { BrandedContentActionsService } from '@api/endpoints/ai-actions/branded-content-actions.service';
import type {
  SocialContentRequestV1,
  ThreadRepliesRequestV1,
} from '@api/endpoints/ai-actions/branded-text-actions.types';
import { BrandedTextRunnerService } from '@api/endpoints/ai-actions/branded-text-runner.service';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { TargetExecutionState } from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestKey = '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c';
const actor = { organizationId: 'org-1', userId: 'user-1' };

vi.mock(
  '@api/services/branded-text-generation/accountless-learning-receipt.util',
  () => ({
    resolveAccountlessLearningReceipt: vi
      .fn()
      .mockImplementation(async () => ({ mode: 'no_destination' })),
  }),
);

function receipt(overrides: Record<string, unknown> = {}) {
  return { artifact: null, id: 'receipt-1', state: 'ready', ...overrides };
}

function createService() {
  const branded = { generate: vi.fn() };
  const modeResolver = {
    resolve: vi.fn().mockResolvedValue({ mode: 'approved_brand' }),
  };
  const posts = { create: vi.fn().mockResolvedValue({ id: 'post-1' }) };
  const service = new BrandedContentActionsService(
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

function seamOf(
  branded: ReturnType<typeof createService>['branded'],
): BrandedTextGenerationRequestV1 {
  return branded.generate.mock.calls[0][0] as BrandedTextGenerationRequestV1;
}

describe('BrandedContentActionsService', () => {
  let ctx: ReturnType<typeof createService>;

  beforeEach(() => {
    ctx = createService();
  });

  function completed(text: string | null, state = 'ready') {
    ctx.branded.generate.mockResolvedValue({
      hasNewDispatch: true,
      kind: 'completed',
      postId: 'post-1',
      receipt: receipt({ state }),
      text,
    });
  }

  describe('generateSocial', () => {
    const social: SocialContentRequestV1 = {
      actor,
      additionalContext: ['Audience: founders'],
      brandId: 'brand-1',
      isThread: false,
      knowledgeSourceIds: ['source-1'],
      knowledgeSpaceIds: ['space-1'],
      platform: 'linkedin',
      requestKey,
      topic: 'Our public API launch',
      variants: 2,
    };

    it('writes the posts through the seam from the resolved mode with the receipt id returned', async () => {
      completed('First post\n---\nSecond post');

      const outcome = await ctx.service.generateSocial(social);

      expect(outcome).toEqual({
        hasNewDispatch: true,
        kind: 'completed',
        result: {
          maxCharacters: getChannelCapability('linkedin')?.caption.maxLength,
          platform: 'linkedin',
          posts: ['First post', 'Second post'],
          postId: 'post-1',
          receiptId: 'receipt-1',
          receiptState: 'ready',
        },
      });
      expect(ctx.modeResolver.resolve).toHaveBeenCalledExactlyOnceWith(
        actor,
        'brand-1',
      );
      const seam = seamOf(ctx.branded);
      expect(seam.input).toMatchObject({
        brandId: 'brand-1',
        contentType: 'post',
        format: 'text',
        knowledgeSourceIds: ['source-1'],
        knowledgeSpaceIds: ['space-1'],
        mode: 'approved_brand',
        platform: 'linkedin',
        requestKey,
        surface: 'agent',
      });
      expect(seam.input.originalPrompt).toContain(
        '<topic>\nOur public API launch\n</topic>',
      );
      expect(seam.input.originalPrompt).toContain('Write 2 distinct posts');
    });

    it('reports the provisional draft as a review receipt', async () => {
      ctx.modeResolver.resolve.mockResolvedValue({
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
      });
      completed('Only post', 'needs_review');

      expect(await ctx.service.generateSocial(social)).toMatchObject({
        kind: 'completed',
        result: { receiptState: 'needs_review' },
      });
      expect(seamOf(ctx.branded).input).toMatchObject({
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
      });
    });

    it('asks for one thread and keeps every segment', async () => {
      completed('Hook\n---\nPoint one\n---\nPoint two');

      const outcome = await ctx.service.generateSocial({
        ...social,
        isThread: true,
        platform: 'twitter',
      });

      expect(outcome).toMatchObject({
        result: {
          maxCharacters: 280,
          posts: ['Hook', 'Point one', 'Point two'],
        },
      });
      expect(seamOf(ctx.branded).input.originalPrompt).toContain(
        'thread of three to seven posts',
      );
    });

    it('saves the normalized posts as the receipt artifact and accepts what survives the gate', async () => {
      completed('x');
      await ctx.service.generateSocial(social);
      const seam = seamOf(ctx.branded);

      expect(seam.acceptText('One\n---\nTwo\n---\nThree')).toBe(true);
      expect(seam.acceptText('---\n---')).toBe(false);
      await seam.persistText('One\n---\nTwo\n---\nThree');

      expect(ctx.posts.create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          brandId: 'brand-1',
          description: 'One\n---\nTwo',
          label: 'Agent post',
          organizationId: 'org-1',
          sourceActionId: requestKey,
          targetExecutionState: TargetExecutionState.DRAFT,
        }),
      );
    });

    it('turns a gate rejection into a stable failure that keeps the receipt', async () => {
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch: true,
        kind: 'stopped',
        postId: null,
        reasonCode: 'channel_limit_exceeded',
        receipt: receipt({ state: 'failed' }),
      });

      expect(await ctx.service.generateSocial(social)).toEqual({
        code: 'no_usable_draft',
        kind: 'failed',
        message: 'The model gave no usable draft. Try again.',
        receiptId: 'receipt-1',
      });
    });

    it('passes a blocked receipt reason and id through', async () => {
      ctx.branded.generate.mockResolvedValue({
        hasNewDispatch: false,
        kind: 'stopped',
        postId: null,
        reasonCode: 'unsupported_capability',
        receipt: receipt({ id: 'receipt-9', state: 'blocked' }),
      });

      expect(await ctx.service.generateSocial(social)).toMatchObject({
        code: 'blocked',
        kind: 'failed',
        reasonCode: 'unsupported_capability',
        receiptId: 'receipt-9',
      });
    });

    it('rejects an unknown platform before any model work', async () => {
      expect(
        await ctx.service.generateSocial({ ...social, platform: 'myspace' }),
      ).toMatchObject({ code: 'unsupported_platform', kind: 'failed' });
      expect(ctx.modeResolver.resolve).not.toHaveBeenCalled();
      expect(ctx.branded.generate).not.toHaveBeenCalled();
    });
  });

  describe('draftThreadReplies', () => {
    const thread: ThreadRepliesRequestV1 = {
      actor,
      brandId: 'brand-1',
      count: 3,
      originalContent: 'We just shipped our public API.',
      requestKey,
      tone: 'educational',
    };

    it('asks for count - 1 replies to the real post in the tone', async () => {
      completed('Reply one\n---\nReply two');

      const outcome = await ctx.service.draftThreadReplies(thread);

      expect(outcome).toEqual({
        hasNewDispatch: true,
        kind: 'completed',
        result: {
          maxCharacters: 280,
          platform: 'twitter',
          posts: ['Reply one', 'Reply two'],
          postId: 'post-1',
          receiptId: 'receipt-1',
          receiptState: 'ready',
        },
      });
      const seam = seamOf(ctx.branded);
      expect(seam.input).toMatchObject({
        brandId: 'brand-1',
        contentType: 'post',
        mode: 'approved_brand',
        platform: 'twitter',
        surface: 'agent',
      });
      expect(seam.input.originalPrompt).toContain('writing 2 follow-up posts');
      expect(seam.input.originalPrompt).toContain(
        '<post>\nWe just shipped our public API.\n</post>',
      );
    });

    it('holds each reply to the X limit and keeps at most the asked replies', async () => {
      completed('x');
      await ctx.service.draftThreadReplies(thread);
      const seam = seamOf(ctx.branded);
      await seam.persistText(`${'word '.repeat(90)}\n---\nTwo\n---\nThree`);

      const saved = ctx.posts.create.mock.calls[0][0].description as string;
      const replies = saved.split('\n---\n');
      expect(replies).toHaveLength(2);
      expect(replies[0].length).toBeLessThanOrEqual(280);
      expect(ctx.posts.create).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Agent thread replies' }),
      );
    });

    it('stops without a model call when the brand access check fails', async () => {
      ctx.modeResolver.resolve.mockRejectedValue(
        new Error('Brand access denied'),
      );

      await expect(ctx.service.draftThreadReplies(thread)).rejects.toThrow(
        'Brand access denied',
      );
      expect(ctx.branded.generate).not.toHaveBeenCalled();
    });
  });
});
