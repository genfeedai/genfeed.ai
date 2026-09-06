import { createHash } from 'node:crypto';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DailyPublishingService } from '@api/collections/workflows/services/daily-publishing.service';
import {
  type SystemWorkflowActionExecutor,
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import {
  DAILY_PUBLISHING_TEMPLATE,
  dailyPublishingAccountDefinition,
} from '@api/collections/workflows/templates/daily-publishing-workflow.template';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { getActionDefinition } from '@genfeedai/actions';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const prisma = {
    credential: { findFirst: vi.fn().mockResolvedValue({ id: 'account' }) },
    post: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const posts = { batchSchedule: vi.fn() };
  const runner = {
    registerWorkflow: vi.fn(),
    registerAction: (id: string, action: SystemWorkflowActionExecutor) =>
      actions.set(id, action),
  };
  const ref = {
    get: (token: unknown) =>
      token === SystemWorkflowRunnerService
        ? runner
        : token === PostsService
          ? posts
          : undefined,
  };
  new DailyPublishingService(
    prisma as unknown as PrismaService,
    ref as unknown as ModuleRef,
  ).onModuleInit();
  const state = {
    request: { brandId: 'brand', autoPublish: false },
    sources: [],
    credentialId: 'account',
    platform: 'twitter',
    accountLabel: 'Founder',
    slotKey: 'daily-publishing:brand:account:2026-09-06',
    postId: 'post',
    outcome: 'quality-approved',
    score: 9,
  };
  const invoke = (id: string, input: Record<string, unknown>) =>
    actions.get(id)?.({
      input,
      context: {
        organizationId: 'org',
        userId: 'user',
        workflowId: 'workflow',
        workflowVersionId: 'version',
        runId: 'run',
      },
      provenance: {
        executionId: 'execution',
        workflowId: 'workflow',
        workflowLabel: 'Daily',
      },
    } satisfies SystemWorkflowActionRequest);
  return { prisma, posts, state, invoke };
}
describe('daily account publishing', () => {
  it('leaves passing content as a review draft by default', async () => {
    const { prisma, posts, state, invoke } = setup();
    prisma.post.findFirst.mockResolvedValue({
      id: 'post',
      workflowExecutionId: 'execution',
      targetIdempotencyKey: 'daily-publishing:brand:account:2026-09-06',
    });
    expect(await invoke('daily-publishing.schedule', { state })).toMatchObject({
      outcome: 'review-draft',
    });
    expect(posts.batchSchedule).not.toHaveBeenCalled();
  });
  it('cannot schedule another execution’s claimed slot', async () => {
    const { prisma, posts, state, invoke } = setup();
    prisma.post.findFirst.mockResolvedValue({
      id: 'post',
      workflowExecutionId: 'other',
      targetIdempotencyKey: 'daily-publishing:brand:account:2026-09-06',
    });
    expect(
      await invoke('daily-publishing.schedule', {
        state: { ...state, request: { brandId: 'brand', autoPublish: true } },
      }),
    ).toMatchObject({ outcome: 'existing-slot' });
    expect(posts.batchSchedule).not.toHaveBeenCalled();
  });
  it('does not schedule low-quality content with automatic publishing enabled', async () => {
    const { prisma, posts, state, invoke } = setup();
    prisma.post.findFirst.mockResolvedValue({
      id: 'post',
      workflowExecutionId: 'execution',
      targetIdempotencyKey: 'daily-publishing:brand:account:2026-09-06',
    });
    expect(
      await invoke('daily-publishing.schedule', {
        state: {
          ...state,
          outcome: 'quality-held',
          request: { brandId: 'brand', autoPublish: true },
        },
      }),
    ).toMatchObject({ outcome: 'quality-held' });
    expect(posts.batchSchedule).not.toHaveBeenCalled();
  });
  it('rejects disconnected or foreign accounts before a post lookup', async () => {
    const { prisma, state, invoke } = setup();
    prisma.credential.findFirst.mockResolvedValue(null);
    await expect(invoke('daily-publishing.select', { state })).rejects.toThrow(
      'unavailable',
    );
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
  });
  it('rejects a forged quality-approved output without persisted evidence', async () => {
    const { prisma, posts, state, invoke } = setup();
    const post = {
      id: 'post',
      workflowExecutionId: 'execution',
      targetIdempotencyKey: state.slotKey,
      description: 'Edited content',
      targetExecutionState: 'draft',
      reviewFeedback: JSON.stringify({
        score: 9,
        executionId: 'execution',
        state: 'quality-approved',
        digest: createHash('sha256').update('Original content').digest('hex'),
      }),
    };
    prisma.post.findFirst.mockResolvedValue(post);
    prisma.post.findFirstOrThrow.mockResolvedValue(post);
    await expect(
      invoke('daily-publishing.schedule', {
        state: { ...state, request: { brandId: 'brand', autoPublish: true } },
      }),
    ).rejects.toThrow('persisted quality');
    expect(posts.batchSchedule).not.toHaveBeenCalled();
  });
  it('resumes source selection for the owning execution without reserving another post', async () => {
    const { prisma, state, invoke } = setup();
    prisma.post.findFirst.mockResolvedValue({
      id: 'post',
      workflowExecutionId: 'execution',
      sourceActionId: 'winner:source',
      promptUsed: 'Evidence text',
      description: '',
      isDeleted: false,
    });
    expect(await invoke('daily-publishing.select', { state })).toMatchObject({
      postId: 'post',
      source: { id: 'winner:source', kind: 'winner', text: 'Evidence text' },
    });
    expect(prisma.post.upsert).not.toHaveBeenCalled();
  });
  it('reports another execution’s failed slot without generating another post', async () => {
    const { prisma, state, invoke } = setup();
    prisma.post.findFirst.mockResolvedValue({
      id: 'post',
      workflowExecutionId: 'other',
      targetError: { message: 'provider timeout' },
      isDeleted: false,
    });
    expect(await invoke('daily-publishing.select', { state })).toMatchObject({
      outcome: 'existing-failed-slot',
    });
    expect(prisma.post.upsert).not.toHaveBeenCalled();
  });
  it('resolves exactly one explicit contract for every daily action', () => {
    for (const stage of [
      'resolve',
      'refresh',
      'collect-analytics',
      'select',
      'generate',
      'evaluate',
      'schedule',
    ])
      expect(
        getActionDefinition(`daily-publishing.${stage}`)?.inputSchema,
      ).toBeDefined();
  });
  it('exposes distinct source, generation, quality and scheduling steps', () => {
    expect(DAILY_PUBLISHING_TEMPLATE.isScheduleEnabled).toBe(false);
    expect(
      dailyPublishingAccountDefinition().definition.nodes.map(
        (node) => node.id,
      ),
    ).toEqual([
      'collect-analytics',
      'select',
      'generate',
      'evaluate',
      'schedule',
    ]);
  });
});
