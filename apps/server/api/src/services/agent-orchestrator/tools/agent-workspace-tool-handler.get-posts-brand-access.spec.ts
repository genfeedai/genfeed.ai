import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deployment = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => deployment.cloud,
}));

/**
 * `get_posts` post and list modes apply the same brand access rule as the
 * calendar (#10133): a post of a brand the connection cannot see is not found
 * and not listed. Posts live in an in-memory store that evaluates the filter.
 */

type Row = Record<string, unknown>;

const ORG = 'org-1';
const posts: Row[] = [
  { brandId: 'brand-a', id: 'post-a', isDeleted: false, organizationId: ORG },
  { brandId: 'brand-b', id: 'post-b', isDeleted: false, organizationId: ORG },
];
const ctx: ToolExecutionContext = { organizationId: ORG, userId: 'user-1' };

function visible(row: Row, where: Row): boolean {
  const allowed = (where.brand as { is: { id: { in: string[] } } } | undefined)
    ?.is.id.in;
  return (
    (where.id === undefined || where.id === row.id) &&
    (where.brandId === undefined || where.brandId === row.brandId) &&
    (allowed === undefined || allowed.includes(String(row.brandId)))
  );
}

function createHandler(allowedBrandIds: string[]) {
  const postsService = {
    findAll: vi.fn(async ({ where }: { where: Row }, { limit }) => ({
      docs: posts.filter((row) => visible(row, where)).slice(0, limit),
    })),
    findOne: vi.fn(
      async (where: Row) => posts.find((row) => visible(row, where)) ?? null,
    ),
  };
  const handler = new AgentWorkspaceToolHandler(
    {} as never,
    {} as never,
    {} as never,
    postsService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  Object.assign(handler, {
    brandAccessService: {
      predicate: vi.fn().mockResolvedValue({ id: { in: allowedBrandIds } }),
    },
  });
  return handler;
}

describe('get_posts brand access (#10133)', () => {
  beforeEach(() => {
    deployment.cloud = true;
  });

  it('opens a post of an accessible brand', async () => {
    const result = await createHandler(['brand-a']).getPost(
      { postId: 'post-a' },
      ctx,
    );

    expect(result).toMatchObject({
      data: { post: { brandId: 'brand-a', id: 'post-a' } },
      success: true,
    });
  });

  it('reports a post of a brand the connection cannot see as not found', async () => {
    const result = await createHandler(['brand-a']).getPost(
      { postId: 'post-b' },
      ctx,
    );

    expect(result).toMatchObject({
      error: 'Post post-b was not found.',
      success: false,
    });
  });

  it('lists only accessible brands, and narrows to one with brandId', async () => {
    const handler = createHandler(['brand-a']);

    const all = await handler.listPosts({}, ctx);
    const narrowed = await handler.listPosts({ brandId: 'brand-b' }, ctx);

    expect(all.data).toMatchObject({ count: 1 });
    expect(narrowed.data).toMatchObject({ count: 0 });
  });

  it('opens any post of the organization on a self-hosted install', async () => {
    deployment.cloud = false;

    const result = await createHandler([]).getPost({ postId: 'post-b' }, ctx);

    expect(result.success).toBe(true);
  });
});
