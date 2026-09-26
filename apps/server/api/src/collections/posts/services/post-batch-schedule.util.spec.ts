import {
  batchSchedulePosts,
  type PostBatchScheduleContext,
  type PostBatchScheduleItem,
  type PostBatchScheduleTarget,
} from '@api/collections/posts/services/post-batch-schedule.util';
import { CredentialPlatform, PostCategory } from '@genfeedai/contracts';

describe('batchSchedulePosts channel target validation (#5193)', () => {
  // Instagram accepts an image, so the fixture ingredient (which the planner
  // categorizes as IMAGE whenever ingredients are present) can satisfy it —
  // unlike YouTube, which needs video specifically.
  const target: PostBatchScheduleTarget = {
    credentialId: 'credential-1',
    platform: CredentialPlatform.INSTAGRAM,
  };

  function makeContext(
    existingPosts: readonly {
      category: string;
      id: string;
      parentId: string | null;
      publishApprovalId: string | null;
      targetSettings: unknown;
      visibility: string | null;
    }[],
  ): {
    context: PostBatchScheduleContext;
    updateCalls: Record<string, unknown>[];
  } {
    const updateCalls: Record<string, unknown>[] = [];
    const post = {
      findMany: vi.fn().mockResolvedValue(existingPosts),
      update: vi.fn((args: Record<string, unknown>) => {
        updateCalls.push(args);
        return { id: (args.where as { id: string }).id };
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const $transaction = vi.fn((writes: unknown[]) => Promise.resolve(writes));
    const context: PostBatchScheduleContext = {
      actorUserId: 'user-1',
      cacheTags: [],
      logger: { log: vi.fn() },
      normalizeData: (data) => data as Record<string, unknown>,
      normalizeDocument: (document) => document as never,
      prisma: { $transaction, post } as never,
    };
    return { context, updateCalls };
  }

  it('skips an item whose content fails the channel contract instead of scheduling it anyway', async () => {
    const { context } = makeContext([
      {
        category: PostCategory.TEXT,
        id: 'post-1',
        parentId: null,
        publishApprovalId: null,
        targetSettings: {},
        visibility: null,
      },
    ]);
    const items: PostBatchScheduleItem[] = [
      {
        // No ingredientIds: Instagram requires at least one media item, so
        // a bare-caption TEXT post can't satisfy the channel contract.
        postId: 'post-1',
        scheduledDate: '2026-11-27T14:30:00Z',
        text: 'Caption only',
      },
    ];

    const result = await batchSchedulePosts(context, items, 'org-1', target);

    expect(result.invalidTargetPostIds).toEqual(['post-1']);
    expect(result.posts).toEqual([]);
    expect(result.missingPostIds).toEqual([]);
  });

  it('schedules an item whose media satisfies the channel contract', async () => {
    const { context } = makeContext([
      {
        category: PostCategory.TEXT,
        id: 'post-1',
        parentId: null,
        publishApprovalId: null,
        targetSettings: {},
        visibility: null,
      },
    ]);
    const items: PostBatchScheduleItem[] = [
      {
        ingredientIds: ['ingredient-1'],
        postId: 'post-1',
        scheduledDate: '2026-11-27T14:30:00Z',
        text: 'Caption with an image',
      },
    ];

    const result = await batchSchedulePosts(context, items, 'org-1', target);

    expect(result.invalidTargetPostIds).toEqual([]);
    expect(result.posts).toHaveLength(1);
  });

  it('does not let one invalid item in the batch block the rest from scheduling', async () => {
    const { context } = makeContext([
      {
        category: PostCategory.TEXT,
        id: 'post-invalid',
        parentId: null,
        publishApprovalId: null,
        targetSettings: {},
        visibility: null,
      },
      {
        category: PostCategory.TEXT,
        id: 'post-valid',
        parentId: null,
        publishApprovalId: null,
        targetSettings: {},
        visibility: null,
      },
    ]);
    const items: PostBatchScheduleItem[] = [
      {
        postId: 'post-invalid',
        scheduledDate: '2026-11-27T14:30:00Z',
        text: 'No media',
      },
      {
        ingredientIds: ['ingredient-1'],
        postId: 'post-valid',
        scheduledDate: '2026-11-27T14:30:00Z',
        text: 'Has media',
      },
    ];

    const result = await batchSchedulePosts(context, items, 'org-1', target);

    expect(result.invalidTargetPostIds).toEqual(['post-invalid']);
    expect(result.posts.map((post) => (post as { id: string }).id)).toEqual([
      'post-valid',
    ]);
  });
});
