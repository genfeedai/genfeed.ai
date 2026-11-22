import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

type StoredConfig = {
  metadata?: { pollState?: Record<string, string> };
  [key: string]: unknown;
};

/**
 * In-memory workflow row that applies the poll-state statement the way
 * Postgres does: it sets only this node's key and `lastPolledAt` inside the
 * stored JSON and leaves every other part of the stored config alone.
 */
function buildPollStateStore(initial: StoredConfig) {
  const row = { config: structuredClone(initial) };
  const prisma = {
    $executeRaw: vi.fn(async (sql: Prisma.Sql) => {
      const values = sql.values as string[];
      const polledAt = values[0];
      const hasCursor = values.length === 5;
      const pollState = {
        ...(row.config.metadata?.pollState ?? {}),
        lastPolledAt: polledAt,
        ...(hasCursor ? { [values[1]]: values[2] } : {}),
      };
      row.config = {
        ...row.config,
        metadata: { ...(row.config.metadata ?? {}), pollState },
      };
      return 1;
    }),
  };
  return { prisma, row };
}

describe('ReplyPollingWorkflowService atomic actions', () => {
  function buildService() {
    return new ReplyPollingWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('adapts one credential into the registered reply-bot workflow request', () => {
    expect(
      buildService().prepareReplyBotTarget('org-1', {
        item: { credentialId: 'credential-1' },
      }),
    ).toEqual({ credentialId: 'credential-1', organizationId: 'org-1' });
  });

  it('summarizes one child workflow result without invoking reply orchestration', () => {
    expect(
      buildService().finalizeReplyBotTarget({
        results: [
          { errors: 1, repliesSent: 2 },
          { errors: 0, repliesSent: 1 },
        ],
      }),
    ).toEqual({ errors: 1, status: 'processed', triggered: 3 });
  });

  describe('processSocialTriggerWorkflow', () => {
    const nodeA = { id: 'node-a', type: 'mentionTrigger' };
    const nodeB = { id: 'node-b', type: 'mentionTrigger' };
    const baseWorkflow = {
      config: { keep: 'original' },
      id: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };

    function buildPoller(
      store: ReturnType<typeof buildPollStateStore>,
      eventIds: Record<string, string | null>,
    ) {
      const queued: Array<{ jobId?: string; nodeId: string }> = [];
      const queue = {
        queueTriggerEvent: vi.fn(
          async (_event: unknown, options?: { jobId?: string }) => {
            queued.push({ jobId: options?.jobId, nodeId: '' });
            return options?.jobId ?? 'job';
          },
        ),
      };
      const service = new ReplyPollingWorkflowService(
        {} as never,
        store.prisma as never,
        queue as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { error: vi.fn(), warn: vi.fn() } as never,
      );
      vi.spyOn(
        service as unknown as {
          checkTrigger: (...args: unknown[]) => Promise<unknown>;
        },
        'checkTrigger',
      ).mockImplementation(async (_workflow, node, lastEventId) => {
        const eventId = eventIds[(node as { id: string }).id];
        if (!eventId || eventId === lastEventId) return null;
        return { data: {}, lastEventId: eventId, platform: 'twitter' };
      });
      return { queued, service };
    }

    it('keeps every trigger node cursor when two nodes of one workflow are polled', async () => {
      const store = buildPollStateStore(baseWorkflow.config);
      const { service } = buildPoller(store, {
        'node-a': 'evt-a',
        'node-b': 'evt-b',
      });

      await service.processSocialTriggerWorkflow({
        item: { node: nodeA, workflow: baseWorkflow },
      });
      await service.processSocialTriggerWorkflow({
        item: { node: nodeB, workflow: baseWorkflow },
      });

      expect(store.row.config.metadata?.pollState).toMatchObject({
        'node-a': 'evt-a',
        'node-b': 'evt-b',
      });
      expect(store.row.config.keep).toBe('original');
    });

    it('enqueues nothing on a second poll with no new events', async () => {
      const store = buildPollStateStore(baseWorkflow.config);
      const { queued, service } = buildPoller(store, { 'node-a': 'evt-a' });

      await service.processSocialTriggerWorkflow({
        item: { node: nodeA, workflow: baseWorkflow },
      });
      const stored = store.row.config.metadata?.pollState ?? {};
      const second = await service.processSocialTriggerWorkflow({
        item: {
          node: nodeA,
          workflow: {
            ...baseWorkflow,
            config: { metadata: { pollState: stored } },
          },
        },
      });

      expect(queued).toHaveLength(1);
      expect(second.triggered).toBe(0);
      expect(store.row.config.metadata?.pollState?.['node-a']).toBe('evt-a');
    });

    it('keeps config saved by a user between the read and the write', async () => {
      const store = buildPollStateStore(baseWorkflow.config);
      const { service } = buildPoller(store, { 'node-a': 'evt-a' });
      const snapshot = { ...baseWorkflow, config: { keep: 'original' } };

      store.row.config = { ...store.row.config, keep: 'edited by user' };
      await service.processSocialTriggerWorkflow({
        item: { node: nodeA, workflow: snapshot },
      });

      expect(store.row.config.keep).toBe('edited by user');
      expect(store.row.config.metadata?.pollState?.['node-a']).toBe('evt-a');
    });

    it('gives the same platform event the same job id', async () => {
      const first = buildPoller(buildPollStateStore(baseWorkflow.config), {
        'node-a': 'evt-a',
      });
      const second = buildPoller(buildPollStateStore(baseWorkflow.config), {
        'node-a': 'evt-a',
      });

      await first.service.processSocialTriggerWorkflow({
        item: { node: nodeA, workflow: baseWorkflow },
      });
      await second.service.processSocialTriggerWorkflow({
        item: { node: nodeA, workflow: baseWorkflow },
      });

      expect(first.queued[0].jobId).toBe('social-trigger-wf-1-node-a-evt-a');
      expect(second.queued[0].jobId).toBe(first.queued[0].jobId);
    });
  });
});
