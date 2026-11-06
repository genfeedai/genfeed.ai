vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, serializer, data) => ({
    data,
    serializer,
  })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostsRetryController } from '@api/collections/posts/controllers/operations/posts-retry.controller';
import { PostRetryService } from '@api/collections/posts/services/post-retry.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import { ApiKeyScope, TargetExecutionState } from '@genfeedai/contracts';
import { PostSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

type Row = Record<string, unknown>;

/** Prisma `where` over scalars and a JSON path `equals`. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition !== null && typeof condition === 'object') {
      const filter = condition as { equals: unknown; path: string[] };
      const value = filter.path.reduce<unknown>(
        (current, segment) => (current as Row | undefined)?.[segment],
        row[key],
      );
      return value === filter.equals;
    }
    return row[key] === condition;
  });
}

const organizationId = testId('org');
const postId = testId('post');

/**
 * The real retry service over an in-memory posts table: a failed parent and
 * two failed thread replies, one failed only because its parent did.
 */
function buildController() {
  const posts: Row[] = [
    {
      id: postId,
      isDeleted: false,
      organizationId,
      retryCount: 3,
      targetExecutionState: TargetExecutionState.FAILED,
    },
    {
      id: 'reply-parent-failed',
      isDeleted: false,
      organizationId,
      parentId: postId,
      targetError: { code: 'parent_failed' },
      targetExecutionState: TargetExecutionState.FAILED,
    },
    {
      id: 'reply-own-failure',
      isDeleted: false,
      organizationId,
      parentId: postId,
      targetError: { code: 'media_rejected' },
      targetExecutionState: TargetExecutionState.FAILED,
    },
  ];
  const postsService = {
    findOne: async (where: Row) =>
      posts.find((row) => matches(row, where)) ?? null,
    patch: async (id: string, data: Row) =>
      Object.assign(posts.find((row) => row.id === id) ?? {}, data),
    prisma: {
      post: {
        updateMany: async ({ data, where }: { data: Row; where: Row }) => {
          const hit = posts.filter((row) => matches(row, where));
          for (const row of hit) Object.assign(row, data);
          return { count: hit.length };
        },
      },
    },
  };
  const silent = () => undefined;
  const controller = new PostsRetryController(
    {
      debug: silent,
      error: silent,
      log: silent,
      warn: silent,
    } as unknown as LoggerService,
    new PostRetryService(postsService as unknown as PostsService),
  );
  const state = (id: string) =>
    posts.find((row) => row.id === id)?.targetExecutionState;
  return { controller, posts, state };
}

describe('PostsRetryController', () => {
  const request = {
    originalUrl: `/api/posts/${postId}/retry`,
    query: {},
  } as Request;
  const user = { id: testId('user'), organizationId } as User;

  it('reschedules a failed post with its parent-failed replies and serializes it', async () => {
    const { controller, state } = buildController();

    await expect(controller.retryPost(request, postId, user)).resolves.toEqual({
      data: expect.objectContaining({
        id: postId,
        retryCount: 0,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
      serializer: PostSerializer,
    });
    expect(state('reply-parent-failed')).toBe(TargetExecutionState.SCHEDULED);
    expect(state('reply-own-failure')).toBe(TargetExecutionState.FAILED);
  });

  it('rejects API-key retry without schedule scope before reads or writes', async () => {
    const { controller, state } = buildController();
    const apiKeyUser = { ...user, isApiKey: true, scopes: [] } as User;

    await expect(
      controller.retryPost(request, postId, apiKeyUser),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_SCHEDULE],
      }),
    });
    expect(state(postId)).toBe(TargetExecutionState.FAILED);
  });

  it('allows API-key retry with the schedule scope', async () => {
    const { controller, state } = buildController();

    await controller.retryPost(request, postId, {
      ...user,
      isApiKey: true,
      scopes: [ApiKeyScope.POSTS_SCHEDULE],
    } as User);

    expect(state(postId)).toBe(TargetExecutionState.SCHEDULED);
  });

  it('does not retry a post of another organization', async () => {
    const { controller, state } = buildController();

    await expect(
      controller.retryPost(request, postId, {
        ...user,
        organizationId: testId('org', 2),
      } as User),
    ).rejects.toMatchObject({ status: 404 });
    expect(state(postId)).toBe(TargetExecutionState.FAILED);
  });
});
