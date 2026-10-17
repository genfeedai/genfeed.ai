import { AgentThreadToolHandler } from '@api/services/agent-orchestrator/tools/agent-thread-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { GENERATE_CONTENT_TEXT_CREDITS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Child = {
  category?: string;
  description: string;
  id: string;
  order: number;
};

const ctx: ToolExecutionContext = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

const xPost = {
  brandId: 'brand-1',
  credentialId: 'cred-1',
  description: 'Launch day',
  id: 'post-1',
  organizationId: 'org-1',
  platform: 'twitter',
  visibility: 'public',
};

function createHandler() {
  const loggerService = { error: vi.fn(), log: vi.fn() };
  let children: Child[] = [];
  let nextId = 1;
  const postsService = {
    count: vi.fn(async () => children.length),
    create: vi.fn(async (dto: Record<string, unknown>) => {
      const created = {
        description: String(dto.description),
        id: `new-${nextId++}`,
        order: Number(dto.order),
      };
      children.push(created);
      return created;
    }),
    findOne: vi.fn(async (): Promise<Record<string, unknown> | null> => xPost),
    getChildren: vi.fn(async () => children),
    patch: vi.fn(async (id: string, dto: Record<string, unknown>) => {
      children = children.map((child) =>
        child.id === id ? { ...child, ...dto } : child,
      );
    }),
  };
  const brandedContentActions = {
    draftThreadReplies: vi.fn(
      async (): Promise<Record<string, unknown>> => ({
        hasNewDispatch: true,
        kind: 'completed',
        result: {
          maxCharacters: 280,
          platform: 'twitter',
          posts: ['Reply one', 'Reply two'],
          receiptId: 'receipt-1',
          receiptState: 'ready',
        },
      }),
    ),
  };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(async () => true),
    deductCreditsFromOrganization: vi.fn(async () => undefined),
  };
  const agentScopeContextService = { assertResourceBrand: vi.fn() };
  const handler = new AgentThreadToolHandler(
    loggerService as unknown as LoggerService,
    postsService as never,
    brandedContentActions as never,
    creditsUtilsService as never,
    agentScopeContextService as never,
  );
  return {
    agentScopeContextService,
    brandedContentActions,
    creditsUtilsService,
    handler,
    loggerService,
    postsService,
    setChildren: (next: Child[]) => {
      children = next;
    },
  };
}

describe('AgentThreadToolHandler', () => {
  let h: ReturnType<typeof createHandler>;

  beforeEach(() => {
    h = createHandler();
  });

  it('handles only the thread tools', () => {
    expect(h.handler.handles('draft_thread')).toBe(true);
    expect(h.handler.handles('add_thread_posts')).toBe(true);
    expect(h.handler.handles('add_first_comment')).toBe(true);
    expect(h.handler.handles('create_post')).toBe(false);
  });

  describe('draft_thread', () => {
    it('returns the proposed replies as a receipt-backed thread preview and adds nothing to the thread', async () => {
      const result = await h.handler.execute(
        'draft_thread',
        { count: 3, postId: 'post-1', tone: 'viral' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        isAddedToThread: false,
        postId: 'post-1',
        proposedPosts: ['Reply one', 'Reply two'],
        receiptId: 'receipt-1',
        receiptState: 'ready',
      });
      expect(result.nextActions).toEqual([
        expect.objectContaining({
          brandedReceipt: { id: 'receipt-1', state: 'ready' },
          contentFormat: 'thread',
          tweets: ['Reply one', 'Reply two'],
          type: 'content_preview_card',
        }),
      ]);
      expect(h.postsService.create).not.toHaveBeenCalled();
      expect(h.postsService.patch).not.toHaveBeenCalled();
      expect(h.brandedContentActions.draftThreadReplies).toHaveBeenCalledWith({
        actor: { organizationId: 'org-1', userId: 'user-1' },
        brandId: 'brand-1',
        count: 3,
        originalContent: 'Launch day',
        requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        tone: 'viral',
      });
    });

    it('charges the flat text price once, in the tool, after a new provider call', async () => {
      const result = await h.handler.execute(
        'draft_thread',
        { count: 3, postId: 'post-1' },
        ctx,
      );

      expect(result).toMatchObject({
        creditsUsed: GENERATE_CONTENT_TEXT_CREDITS,
        isBillingDelegated: true,
        success: true,
      });
      expect(
        h.creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith('org-1', GENERATE_CONTENT_TEXT_CREDITS);
      expect(
        h.creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledTimes(1);
      expect(
        h.creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        GENERATE_CONTENT_TEXT_CREDITS,
        'Agent tool: draft_thread',
        expect.anything(),
        { brandId: 'brand-1' },
      );
    });

    it('does not charge a replay that made no provider call', async () => {
      h.brandedContentActions.draftThreadReplies.mockResolvedValue({
        hasNewDispatch: false,
        kind: 'completed',
        result: {
          maxCharacters: 280,
          platform: 'twitter',
          posts: ['Reply one'],
          receiptId: 'receipt-1',
          receiptState: 'ready',
        },
      });

      const result = await h.handler.execute(
        'draft_thread',
        { count: 2, postId: 'post-1' },
        ctx,
      );

      expect(result).toMatchObject({ creditsUsed: 0, success: true });
      expect(result.isBillingDelegated).toBeUndefined();
      expect(
        h.creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
    });

    it('refuses before the provider when the balance cannot cover the draft', async () => {
      h.creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        false,
      );

      const result = await h.handler.execute(
        'draft_thread',
        { count: 3, postId: 'post-1' },
        ctx,
      );

      expect(result).toMatchObject({
        creditsUsed: 0,
        data: { code: 'insufficient_credits' },
        success: false,
      });
      expect(h.brandedContentActions.draftThreadReplies).not.toHaveBeenCalled();
      expect(
        h.creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
    });

    it('looks the post up inside the caller organization', async () => {
      await h.handler.execute(
        'draft_thread',
        { count: 2, postId: 'post-1' },
        ctx,
      );

      expect(h.postsService.findOne).toHaveBeenCalledWith(
        { id: 'post-1', isDeleted: false, organizationId: 'org-1' },
        [],
      );
      expect(h.postsService.count).toHaveBeenCalledWith('org-1', {
        parentId: 'post-1',
      });
    });

    it.each([
      [
        'a post that is missing or in another organization',
        null,
        'does not exist',
      ],
      [
        'a post that is not on X',
        { ...xPost, platform: 'linkedin' },
        'Twitter/X',
      ],
    ])(
      'refuses %s without spending a generation',
      async (_name, post, reason) => {
        h.postsService.findOne.mockResolvedValue(post);

        const result = await h.handler.execute(
          'draft_thread',
          { count: 3, postId: 'post-1' },
          ctx,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain(reason);
        expect(
          h.brandedContentActions.draftThreadReplies,
        ).not.toHaveBeenCalled();
      },
    );

    it('refuses a post that already has replies', async () => {
      h.setChildren([{ description: 'Reply', id: 'c1', order: 1 }]);

      const result = await h.handler.execute(
        'draft_thread',
        { count: 3, postId: 'post-1' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already has thread children');
      expect(h.brandedContentActions.draftThreadReplies).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range count before touching the post', async () => {
      const result = await h.handler.execute(
        'draft_thread',
        { count: 9, postId: 'post-1' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(h.postsService.findOne).not.toHaveBeenCalled();
    });

    it('reports a generation failure without exposing the cause', async () => {
      h.brandedContentActions.draftThreadReplies.mockRejectedValue(
        new Error('provider key sk-secret rejected'),
      );

      const result = await h.handler.execute(
        'draft_thread',
        { count: 3, postId: 'post-1' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).not.toContain('sk-secret');
      expect(h.loggerService.error).toHaveBeenCalled();
    });

    it('fails when no valid reply came back', async () => {
      h.brandedContentActions.draftThreadReplies.mockResolvedValue({
        hasNewDispatch: true,
        kind: 'completed',
        result: {
          maxCharacters: 280,
          platform: 'twitter',
          posts: [],
          receiptId: 'receipt-1',
          receiptState: 'ready',
        },
      });

      const result = await h.handler.execute(
        'draft_thread',
        { count: 3, postId: 'post-1' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.nextActions).toBeUndefined();
      expect(result.creditsUsed).toBe(GENERATE_CONTENT_TEXT_CREDITS);
      expect(
        h.creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledTimes(1);
    });

    it('reports a stopped generation with its reason and receipt', async () => {
      h.brandedContentActions.draftThreadReplies.mockResolvedValue({
        code: 'blocked',
        kind: 'failed',
        message: 'Your brand voice could not be applied (no_draft_revision).',
        reasonCode: 'no_draft_revision',
        receiptId: 'receipt-9',
      });

      const result = await h.handler.execute(
        'draft_thread',
        { count: 3, postId: 'post-1' },
        ctx,
      );

      expect(result).toEqual({
        creditsUsed: 0,
        data: {
          code: 'blocked',
          reasonCode: 'no_draft_revision',
          receiptId: 'receipt-9',
        },
        error: 'Your brand voice could not be applied (no_draft_revision).',
        success: false,
      });
    });

    it('charges a run that stopped after the provider recorded an attempt', async () => {
      h.brandedContentActions.draftThreadReplies.mockResolvedValue({
        code: 'blocked',
        hasNewDispatch: true,
        kind: 'failed',
        message: 'The dispatch window closed.',
        reasonCode: 'dispatch_window_expired',
        receiptId: 'receipt-9',
      });

      const result = await h.handler.execute(
        'draft_thread',
        { count: 3, postId: 'post-1' },
        ctx,
      );

      expect(result).toEqual({
        creditsUsed: GENERATE_CONTENT_TEXT_CREDITS,
        data: {
          code: 'blocked',
          reasonCode: 'dispatch_window_expired',
          receiptId: 'receipt-9',
        },
        error: 'The dispatch window closed.',
        isBillingDelegated: true,
        success: false,
      });
      expect(
        h.creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledTimes(1);
    });

    it('needs a brand to write the replies for', async () => {
      h.postsService.findOne.mockResolvedValue({
        ...xPost,
        brandId: undefined,
      });

      const result = await h.handler.execute(
        'draft_thread',
        { count: 3, postId: 'post-1' },
        { organizationId: 'org-1', userId: 'user-1' },
      );

      expect(result).toMatchObject({
        error: 'A brand is required to draft a thread.',
        success: false,
      });
      expect(h.brandedContentActions.draftThreadReplies).not.toHaveBeenCalled();
    });

    it('enforces the thread brand scope', async () => {
      h.agentScopeContextService.assertResourceBrand.mockImplementation(() => {
        throw new Error('outside the validated thread brand scope');
      });
      const scoped = {
        ...ctx,
        validatedScope: { brandId: 'brand-2' },
      } as ToolExecutionContext;

      await expect(
        h.handler.execute(
          'draft_thread',
          { count: 3, postId: 'post-1' },
          scoped,
        ),
      ).rejects.toThrow('brand scope');
      expect(h.brandedContentActions.draftThreadReplies).not.toHaveBeenCalled();
    });
  });

  describe('add_thread_posts', () => {
    it('saves replies in order as drafts under the parent', async () => {
      const result = await h.handler.execute(
        'add_thread_posts',
        { postId: 'post-1', posts: ['One', 'Two'] },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(h.postsService.create).toHaveBeenCalledTimes(2);
      expect(h.postsService.create.mock.calls[0][0]).toMatchObject({
        credentialId: 'cred-1',
        description: 'One',
        order: 1,
        organizationId: 'org-1',
        parentId: 'post-1',
        targetExecutionState: 'draft',
        userId: 'user-1',
      });
      expect(h.postsService.create.mock.calls[1][0]).toMatchObject({
        description: 'Two',
        order: 2,
      });
      expect(result.data).toMatchObject({
        parentId: 'post-1',
        savedPosts: [
          { description: 'One', order: 1 },
          { description: 'Two', order: 2 },
        ],
      });
    });

    it('inserts before a trailing @grok post and moves it last', async () => {
      h.setChildren([
        { description: 'Existing', id: 'c1', order: 1 },
        { description: '@grok thoughts?', id: 'grok-1', order: 2 },
      ]);

      const result = await h.handler.execute(
        'add_thread_posts',
        { postId: 'post-1', posts: ['A', 'B'] },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(
        h.postsService.create.mock.calls.map(([dto]) => [
          dto.description,
          dto.order,
        ]),
      ).toEqual([
        ['A', 2],
        ['B', 3],
      ]);
      expect(h.postsService.patch).toHaveBeenCalledWith(
        'grok-1',
        { order: 4 },
        [],
      );
      expect(result.data).toMatchObject({ closingPostId: 'grok-1' });
    });

    it('saves a new closing @grok question after the replies', async () => {
      const result = await h.handler.execute(
        'add_thread_posts',
        { grokQuestion: 'is this right?', postId: 'post-1', posts: ['A'] },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(h.postsService.create).toHaveBeenCalledTimes(2);
      expect(h.postsService.create.mock.calls[1][0]).toMatchObject({
        description: '@grok is this right?',
        order: 2,
      });
    });

    it('refuses a post that is not on X', async () => {
      h.postsService.findOne.mockResolvedValue({
        ...xPost,
        platform: 'youtube',
      });

      const result = await h.handler.execute(
        'add_thread_posts',
        { postId: 'post-1', posts: ['A'] },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Twitter/X');
      expect(h.postsService.create).not.toHaveBeenCalled();
    });

    it('refuses a parent outside the caller organization', async () => {
      h.postsService.findOne.mockResolvedValue(null);

      const result = await h.handler.execute(
        'add_thread_posts',
        { postId: 'other-org-post', posts: ['A'] },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(h.postsService.findOne).toHaveBeenCalledWith(
        { id: 'other-org-post', isDeleted: false, organizationId: 'org-1' },
        [],
      );
      expect(h.postsService.create).not.toHaveBeenCalled();
    });

    it('scopes the existing-children read to the organization', async () => {
      await h.handler.execute(
        'add_thread_posts',
        { postId: 'post-1', posts: ['A'] },
        ctx,
      );

      expect(h.postsService.getChildren).toHaveBeenCalledWith(
        'post-1',
        'org-1',
        [],
        500,
      );
    });

    it('refuses a parent without a publishing account', async () => {
      h.postsService.findOne.mockResolvedValue({
        ...xPost,
        credentialId: null,
      });

      const result = await h.handler.execute(
        'add_thread_posts',
        { postId: 'post-1', posts: ['A'] },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('publishing account');
      expect(h.postsService.create).not.toHaveBeenCalled();
    });

    it('refuses an over-long reply before saving any', async () => {
      const result = await h.handler.execute(
        'add_thread_posts',
        { postId: 'post-1', posts: ['fine', 'x'.repeat(281)] },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(h.postsService.create).not.toHaveBeenCalled();
    });

    describe('partial failure', () => {
      it('reports what was saved, keeps @grok last, and names the remaining replies', async () => {
        h.setChildren([
          { description: '@grok thoughts?', id: 'grok-1', order: 1 },
        ]);
        h.postsService.create
          .mockImplementationOnce(async (dto: Record<string, unknown>) => ({
            description: String(dto.description),
            id: 'new-a',
            order: Number(dto.order),
          }))
          .mockRejectedValueOnce(new Error('db: connection reset'));

        const result = await h.handler.execute(
          'add_thread_posts',
          { postId: 'post-1', posts: ['A', 'B', 'C'] },
          ctx,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Saved 1 of 3');
        expect(result.error).not.toContain('connection reset');
        expect(result.data).toMatchObject({
          remainingPosts: ['B', 'C'],
          savedPosts: [{ description: 'A', id: 'new-a', order: 1 }],
        });
        expect(h.postsService.patch).toHaveBeenCalledWith(
          'grok-1',
          { order: 2 },
          [],
        );
      });

      it('does not create a closing @grok post after a failed batch', async () => {
        h.postsService.create.mockRejectedValueOnce(new Error('boom'));

        const result = await h.handler.execute(
          'add_thread_posts',
          { grokQuestion: 'q?', postId: 'post-1', posts: ['A'] },
          ctx,
        );

        expect(result.success).toBe(false);
        expect(h.postsService.create).toHaveBeenCalledTimes(1);
        expect(result.data).toMatchObject({
          pendingGrokQuestion: '@grok q?',
          remainingPosts: ['A'],
        });
      });

      it('does not duplicate saved replies when the same batch is retried', async () => {
        h.postsService.create
          .mockImplementationOnce(async (dto: Record<string, unknown>) => {
            h.setChildren([
              {
                description: String(dto.description),
                id: 'new-a',
                order: Number(dto.order),
              },
            ]);
            return {
              description: String(dto.description),
              id: 'new-a',
              order: Number(dto.order),
            };
          })
          .mockRejectedValueOnce(new Error('boom'));
        await h.handler.execute(
          'add_thread_posts',
          { postId: 'post-1', posts: ['A', 'B'] },
          ctx,
        );
        h.postsService.create.mockClear();

        const retry = await h.handler.execute(
          'add_thread_posts',
          { postId: 'post-1', posts: ['A', 'B'] },
          ctx,
        );

        expect(retry.success).toBe(true);
        expect(
          h.postsService.create.mock.calls.map(([dto]) => dto.description),
        ).toEqual(['B']);
        expect(retry.data).toMatchObject({ alreadySavedCount: 1 });
      });
    });
  });

  describe('add_first_comment', () => {
    const linkedinPost = { ...xPost, platform: 'linkedin' };

    it('saves a first comment as a text draft under the post', async () => {
      h.postsService.findOne.mockResolvedValue(linkedinPost);

      const result = await h.handler.execute(
        'add_first_comment',
        { comment: 'Link in the comments', postId: 'post-1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(h.postsService.create.mock.calls[0][0]).toMatchObject({
        category: 'TEXT',
        description: 'Link in the comments',
        label: 'First comment',
        organizationId: 'org-1',
        parentId: 'post-1',
        targetExecutionState: 'draft',
      });
    });

    it('does not add a second first comment', async () => {
      h.postsService.findOne.mockResolvedValue(linkedinPost);
      h.setChildren([
        { category: 'TEXT', description: 'Existing', id: 'fc-1', order: 1 },
      ]);

      const result = await h.handler.execute(
        'add_first_comment',
        { comment: 'Another', postId: 'post-1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ alreadyExists: true });
      expect(h.postsService.create).not.toHaveBeenCalled();
    });

    it('refuses X posts, which use thread replies instead', async () => {
      const result = await h.handler.execute(
        'add_first_comment',
        { comment: 'Hi', postId: 'post-1' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(h.postsService.create).not.toHaveBeenCalled();
    });

    it('refuses a post outside the organization', async () => {
      h.postsService.findOne.mockResolvedValue(null);

      const result = await h.handler.execute(
        'add_first_comment',
        { comment: 'Hi', postId: 'other' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(h.postsService.findOne).toHaveBeenCalledWith(
        { id: 'other', isDeleted: false, organizationId: 'org-1' },
        [],
      );
    });
  });
});
