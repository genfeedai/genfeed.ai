import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { INodeExecutor } from '../../executors/base-executor';
import { ReportDeliveryExecutor } from '../../executors/saas/report-delivery-executor';
import { SocialReadExecutor } from '../../executors/saas/social-read-executor';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
} from '../../types';
import { createExecutableActionNode } from '../../utils/action-node';
import { DEFAULT_CREDIT_COSTS } from '../../utils/credit-calculator';
import { type NodeExecutor, WorkflowEngine } from '../engine';

/**
 * #2664 scheduled digest proof: read → analyze → report, unattended.
 * Three fires stand in for the staging "three consecutive mornings" gate.
 */

function makeNode(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
): ExecutableNode {
  return createExecutableActionNode({
    actionId: type,
    id,
    label: id,
    parameters: config,
  });
}

function makeEdge(
  source: string,
  target: string,
  handles: { sourceHandle?: string; targetHandle?: string } = {},
): ExecutableEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    ...handles,
  };
}

function wrapExecutor(executor: INodeExecutor): NodeExecutor {
  return async (node, inputs, context) =>
    (await executor.execute({ context, inputs, node })).data;
}

function makeDigestWorkflow(): ExecutableWorkflow {
  return {
    edges: [
      makeEdge('read', 'analyze', {
        sourceHandle: 'summary',
        targetHandle: 'summary',
      }),
      makeEdge('analyze', 'report', {
        sourceHandle: 'content',
        targetHandle: 'content',
      }),
    ],
    id: 'wf-morning-digest',
    lockedNodeIds: [],
    nodes: [
      makeNode('read', 'socialRead', {
        limit: 5,
        mode: 'timeline',
        username: 'genfeed',
      }),
      makeNode('analyze', 'postGen'),
      makeNode('report', 'reportDelivery', {
        channel: 'notification',
        subject: 'Morning X digest',
      }),
    ],
    organizationId: 'org-1',
    userId: 'user-1',
    versionId: 'version-1',
  };
}

describe('morning X digest (#2664)', () => {
  let engine: WorkflowEngine;
  let socialRead: SocialReadExecutor;
  let reportDelivery: ReportDeliveryExecutor;
  let notificationSender: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    engine = new WorkflowEngine({
      creditCosts: DEFAULT_CREDIT_COSTS,
      maxConcurrency: 1,
      retryConfig: {
        backoffMultiplier: 1,
        baseDelayMs: 0,
        maxDelayMs: 0,
        maxRetries: 0,
      },
    });
    socialRead = new SocialReadExecutor();
    socialRead.setProvider(
      vi.fn().mockResolvedValue([
        {
          authorUsername: 'genfeed',
          createdAt: '2026-08-12T07:00:00.000Z',
          id: '1',
          likes: 4,
          text: 'shipped the digest nodes',
        },
      ]),
    );
    reportDelivery = new ReportDeliveryExecutor();
    notificationSender = vi.fn().mockResolvedValue(undefined);
    reportDelivery.setNotificationSender(notificationSender);

    engine.registerExecutor('socialRead', wrapExecutor(socialRead));
    engine.registerExecutor('postGen', async (_node, inputs) => {
      const summary = String(inputs.get('summary') ?? '');
      return { content: `Morning digest\n${summary}` };
    });
    engine.registerExecutor('reportDelivery', wrapExecutor(reportDelivery));
  });

  it('runs read → analyze → report and records the delivery', async () => {
    const result = await engine.execute(makeDigestWorkflow(), {
      executionId: 'exec-digest-1',
    });

    expect(result.status).toBe('completed');
    expect(result.nodeResults.get('read')?.status).toBe('completed');
    expect(result.nodeResults.get('analyze')?.status).toBe('completed');
    expect(result.nodeResults.get('report')?.status).toBe('completed');
    expect(result.nodeResults.get('report')?.output).toEqual(
      expect.objectContaining({
        delivered: true,
        destination: 'notification',
      }),
    );
    expect(result.totalCreditsUsed).toBe(DEFAULT_CREDIT_COSTS.socialRead);
    expect(notificationSender).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Morning X digest',
        userId: 'user-1',
      }),
    );
    const body = String(notificationSender.mock.calls[0]?.[0]?.body ?? '');
    expect(body).toContain('Morning digest');
    expect(body).toContain('shipped the digest nodes');
  });

  it('fails the run when the social provider errors and does not send a report', async () => {
    socialRead.setProvider(
      vi.fn().mockRejectedValue(new Error('twitter provider 503')),
    );

    const result = await engine.execute(makeDigestWorkflow());

    expect(result.status).toBe('failed');
    expect(result.error).toContain('twitter provider 503');
    expect(result.nodeResults.get('read')?.status).toBe('failed');
    expect(result.nodeResults.has('report')).toBe(false);
    expect(notificationSender).not.toHaveBeenCalled();
  });

  it('fails the run when report delivery throws, with destination in history', async () => {
    notificationSender.mockRejectedValueOnce(
      new Error('notification bus down'),
    );

    const result = await engine.execute(makeDigestWorkflow());

    expect(result.status).toBe('failed');
    expect(result.nodeResults.get('read')?.status).toBe('completed');
    expect(result.nodeResults.get('report')?.status).toBe('failed');
    expect(result.nodeResults.get('report')?.error).toContain(
      'notification bus down',
    );
  });

  it('delivers on three consecutive scheduled fires', async () => {
    const workflow = makeDigestWorkflow();

    for (let fire = 0; fire < 3; fire += 1) {
      const result = await engine.execute(workflow, {
        executionId: `exec-digest-${fire + 1}`,
      });
      expect(result.status).toBe('completed');
      expect(result.nodeResults.get('report')?.output).toEqual(
        expect.objectContaining({ delivered: true }),
      );
    }

    expect(notificationSender).toHaveBeenCalledTimes(3);
  });
});
