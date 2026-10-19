import { BrandedContentActionsService } from '@api/endpoints/ai-actions/branded-content-actions.service';
import type {
  SocialContentRequestV1,
  ThreadRepliesRequestV1,
} from '@api/endpoints/ai-actions/branded-text-actions.types';
import { BrandedTextRunnerService } from '@api/endpoints/ai-actions/branded-text-runner.service';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { PostFormat, TargetExecutionState } from '@genfeedai/contracts';
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
  const branded = { generate: vi.fn(), generateThread: vi.fn() };
  const modeResolver = {
    resolve: vi.fn().mockResolvedValue({ mode: 'approved_brand' }),
  };
  const posts = {
    create: vi.fn().mockImplementation(async (input: { order?: number }) => ({
      id: `post-${(input.order ?? 0) + 1}`,
    })),
    findOne: vi.fn(),
    getChildren: vi.fn(),
    remove: vi.fn().mockResolvedValue(null),
  };
  const material = { describePostArtifact: vi.fn() };
  const service = new BrandedContentActionsService(
    new BrandedTextRunnerService(
      branded as never,
      modeResolver as never,
      posts as never,
      {} as never,
      {
        resolveModelKey: vi.fn().mockResolvedValue('openai/mini-text'),
      } as never,
      material as never,
    ),
  );
  return { branded, material, modeResolver, posts, service };
}

function seamOf(
  branded: ReturnType<typeof createService>['branded'],
): BrandedTextGenerationRequestV1 {
  return (branded.generate.mock.calls[0] ??
    branded.generateThread.mock.calls[0])[0] as BrandedTextGenerationRequestV1;
}

describe('BrandedContentActionsService', () => {
  let ctx: ReturnType<typeof createService>;

  beforeEach(() => {
    ctx = createService();
  });

  function completed(text: string | null, state = 'ready') {
    const outcome = {
      hasNewDispatch: true,
      kind: 'completed',
      postId: 'post-1',
      receipt: receipt({ state }),
      text,
    };
    ctx.branded.generate.mockResolvedValue(outcome);
    ctx.branded.generateThread.mockResolvedValue(outcome);
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
      expect(ctx.branded.generate).not.toHaveBeenCalled();
      expect(seamOf(ctx.branded).input).toMatchObject({
        contentType: 'thread',
        format: 'thread',
      });
      expect(seamOf(ctx.branded).input.originalPrompt).toContain(
        'thread of three to seven posts',
      );
    });

    it('saves a thread as a root post with its ordered replies', async () => {
      completed('x');
      await ctx.service.generateSocial({
        ...social,
        isThread: true,
        platform: 'twitter',
      });

      expect(
        await seamOf(ctx.branded).persistText('Hook\n---\nOne\n---\nTwo'),
      ).toEqual({ postId: 'post-1' });
      expect(ctx.posts.create.mock.calls.map(([input]) => input)).toEqual([
        expect.objectContaining({
          description: 'Hook',
          format: PostFormat.THREAD,
          label: 'Agent thread',
          order: 0,
          sourceActionId: requestKey,
        }),
        expect.objectContaining({
          description: 'One',
          format: PostFormat.THREAD,
          order: 1,
          parentId: 'post-1',
          sourceActionId: `${requestKey}:post:1`,
        }),
        expect.objectContaining({
          description: 'Two',
          order: 2,
          parentId: 'post-1',
        }),
      ]);
      expect(ctx.posts.create.mock.calls[0][0]).not.toHaveProperty('parentId');
    });

    it('discards a partly written thread before reporting the failure', async () => {
      completed('x');
      await ctx.service.generateSocial({
        ...social,
        isThread: true,
        platform: 'twitter',
      });
      ctx.posts.create
        .mockResolvedValueOnce({ id: 'root-1' })
        .mockRejectedValueOnce(new Error('write failed'));

      await expect(
        seamOf(ctx.branded).persistText('Hook\n---\nOne'),
      ).rejects.toThrow('write failed');
      expect(ctx.posts.remove).toHaveBeenCalledExactlyOnceWith('root-1');
    });

    it('replays a thread only while its saved material matches the receipt', async () => {
      ctx.branded.generateThread.mockResolvedValue({
        hasNewDispatch: false,
        kind: 'completed',
        postId: 'post-1',
        receipt: receipt({ artifact: { version: 'v-1' } }),
        text: null,
      });
      ctx.material.describePostArtifact.mockResolvedValue({
        artifact: { version: 'v-1' },
      });
      ctx.posts.findOne.mockResolvedValue({ description: 'Hook' });
      ctx.posts.getChildren.mockResolvedValue([
        { description: 'One' },
        { description: 'Two' },
      ]);
      const thread = { ...social, isThread: true, platform: 'twitter' };

      expect(await ctx.service.generateSocial(thread)).toMatchObject({
        kind: 'completed',
        result: { posts: ['Hook', 'One', 'Two'] },
      });

      ctx.material.describePostArtifact.mockResolvedValue({
        artifact: { version: 'v-2' },
      });
      expect(await ctx.service.generateSocial(thread)).toMatchObject({
        kind: 'failed',
        reasonCode: 'receipt_artifact_not_found',
      });
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
        hasNewDispatch: true,
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
