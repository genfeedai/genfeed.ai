import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import type { AgentStrategyOpportunityStatus } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { AgentStrategyConversationQueueService } from '@api/collections/agent-strategies/services/agent-strategy-conversation-queue.service';
import type { ConversationSource } from '@api/collections/agent-strategies/services/agent-strategy-conversation-queue.types';
import { CONVERSATION_QUEUE_LIMIT } from '@api/collections/agent-strategies/services/agent-strategy-conversation-queue.util';
import type { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const ORG = 'org-1';
const SCOPE = { brandId: 'brand-1', credentialId: 'cred-1' };
const OWNER = {
  organizationId: ORG,
  ownHandle: 'genfeedai',
  scope: SCOPE,
  strategyId: 'strategy-1',
  topics: ['video generation', 'brand voice'],
};

/** The opportunity store, kept in memory with the same rules as the real one. */
function fakeOpportunities() {
  const rows = new Map<string, AgentStrategyOpportunityDocument>();
  let sequence = 0;
  const service = {
    async createIfMissing(input: Record<string, unknown>) {
      const existing = [...rows.values()].find(
        (row) => row.sourceRef === input.sourceRef && row.topic === input.topic,
      );
      if (existing) {
        return existing;
      }
      sequence += 1;
      const row = {
        ...input,
        createdAt: NOW,
        id: `opp-${sequence}`,
        status: 'queued',
      } as unknown as AgentStrategyOpportunityDocument;
      rows.set(row.id, row);
      return row;
    },
    async findById(id: string) {
      return rows.get(id) ?? null;
    },
    async listByStrategy(
      _strategyId: string,
      _organizationId: string,
      options: {
        isConversationQueue?: boolean;
        statuses?: AgentStrategyOpportunityStatus[];
      } = {},
    ) {
      return [...rows.values()].filter(
        (row) =>
          (row.sourceType === 'conversation') ===
            Boolean(options.isConversationQueue) &&
          (!options.statuses || options.statuses.includes(row.status as never)),
      );
    },
    async transitionStatus(
      id: string,
      _organizationId: string,
      from: AgentStrategyOpportunityStatus[],
      status: AgentStrategyOpportunityStatus,
      patch: Record<string, unknown> = {},
    ) {
      const row = rows.get(id);
      if (!row || !from.includes(row.status as never)) {
        return null;
      }
      const next = { ...row, ...patch, status };
      rows.set(id, next);
      return next;
    },
    async updateStatus(
      id: string,
      _organizationId: string,
      status: AgentStrategyOpportunityStatus,
      patch: Record<string, unknown> = {},
    ) {
      const row = rows.get(id);
      if (!row) {
        return null;
      }
      const next = { ...row, ...patch, status };
      rows.set(id, next);
      return next;
    },
  };
  return {
    rows,
    service: service as unknown as AgentStrategyOpportunitiesService,
  };
}

function post(id: string, overrides: Partial<ConversationSource> = {}) {
  return {
    authorUsername: `author${id}`,
    content: `Question ${id}: how do you keep brand voice in video generation?`,
    createdAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
    id,
    url: `https://x.com/author${id}/status/${id}`,
    ...overrides,
  } satisfies ConversationSource;
}

function setup() {
  const store = fakeOpportunities();
  return {
    ...store,
    queue: new AgentStrategyConversationQueueService(store.service),
  };
}

describe('AgentStrategyConversationQueueService', () => {
  it('queues only the posts that fit, with source, author, time and reason', async () => {
    const { queue, rows } = setup();

    const result = await queue.ingest(
      OWNER,
      [
        post('1'),
        post('2', { content: 'Lunch with friends' }),
        post('3', { authorUsername: 'genfeedai' }),
      ],
      NOW,
    );

    expect(result).toMatchObject({ ineligible: 2, queued: 1 });
    const [item] = await queue.list(OWNER, NOW);
    expect(item).toMatchObject({
      scope: SCOPE,
      source: {
        authorUsername: 'author1',
        id: '1',
        url: 'https://x.com/author1/status/1',
      },
      state: 'new',
    });
    expect(item.reason).toContain('video generation');
    expect(item.expiresAt).toBeTruthy();
    // The autopilot's planning cost and traffic are untouched.
    expect([...rows.values()][0]).toMatchObject({
      estimatedCreditCost: 0,
      sourceType: 'conversation',
    });
  });

  it('lists the best conversation first and re-ranks by how old each post is now', async () => {
    const { queue } = setup();
    await queue.ingest(
      OWNER,
      [
        post('old', {
          createdAt: new Date(NOW.getTime() - 40 * 3_600_000).toISOString(),
        }),
        post('fresh', {
          createdAt: new Date(NOW.getTime() - 1 * 3_600_000).toISOString(),
        }),
      ],
      NOW,
    );

    expect(
      (await queue.list(OWNER, NOW)).map((item) => item.source.id),
    ).toEqual(['fresh', 'old']);
  });

  it('never queues the same post twice, even after it is dismissed', async () => {
    const { queue } = setup();
    await queue.ingest(OWNER, [post('1')], NOW);
    const [item] = await queue.list(OWNER, NOW);
    await queue.dismiss(OWNER, item.id);

    const again = await queue.ingest(OWNER, [post('1')], NOW);

    expect(again).toMatchObject({ alreadySeen: 1, queued: 0 });
    expect(await queue.list(OWNER, NOW)).toEqual([]);
  });

  it('keeps the queue bounded and reports what it had no room for', async () => {
    const { queue } = setup();
    const posts = Array.from(
      { length: CONVERSATION_QUEUE_LIMIT + 5 },
      (_, index) => post(String(index + 1)),
    );

    const result = await queue.ingest(OWNER, posts, NOW);

    expect(result).toMatchObject({
      queued: CONVERSATION_QUEUE_LIMIT,
      skippedForRoom: 5,
    });
    expect(await queue.list(OWNER, NOW)).toHaveLength(CONVERSATION_QUEUE_LIMIT);
  });

  it('takes dismissed and replied conversations out of the default queue', async () => {
    const { queue } = setup();
    await queue.ingest(OWNER, [post('1'), post('2'), post('3')], NOW);
    const ids = (await queue.list(OWNER, NOW)).map((item) => item.id);

    await queue.dismiss(OWNER, ids[0]);
    await queue.recordReply(OWNER, ids[1], { externalPostId: 'x-900' }, NOW);

    expect((await queue.list(OWNER, NOW)).map((item) => item.id)).toEqual([
      ids[2],
    ]);
  });

  it('expires a conversation that went stale', async () => {
    const { queue, rows } = setup();
    await queue.ingest(OWNER, [post('1')], NOW);

    const later = new Date(NOW.getTime() + 60 * 3_600_000);

    expect(await queue.list(OWNER, later)).toEqual([]);
    expect([...rows.values()][0].status).toBe('expired');
  });

  it('discards what was queued under another brand or account when the scope changes', async () => {
    const { queue, rows } = setup();
    await queue.ingest(OWNER, [post('1')], NOW);
    const [item] = await queue.list(OWNER, NOW);
    const other = { ...OWNER, scope: { brandId: 'brand-2' } };

    expect(await queue.list(other, NOW)).toEqual([]);
    expect([...rows.values()][0].status).toBe('discarded');
    await expect(queue.prepareDraft(other, item.id, NOW)).rejects.toThrow(
      /another brand or account/,
    );
  });

  it('hands the draft the exact post and its scope, and marks it drafted without sending', async () => {
    const { queue } = setup();
    await queue.ingest(OWNER, [post('1')], NOW);
    const [item] = await queue.list(OWNER, NOW);

    const context = await queue.prepareDraft(OWNER, item.id, NOW);
    const drafted = await queue.recordDraft(
      OWNER,
      item.id,
      { turboRunId: 'run-1' },
      NOW,
    );

    expect(context).toMatchObject({
      opportunityId: item.id,
      scope: SCOPE,
      source: item.source,
    });
    expect(drafted).toMatchObject({
      draft: { turboRunId: 'run-1' },
      state: 'drafted',
    });
    expect(await queue.list(OWNER, NOW)).toHaveLength(1);
  });

  it('records a reply only with the id of the sent post, and only once', async () => {
    const { queue } = setup();
    await queue.ingest(OWNER, [post('1')], NOW);
    const [item] = await queue.list(OWNER, NOW);

    await expect(
      queue.recordReply(OWNER, item.id, { externalPostId: '  ' }, NOW),
    ).rejects.toThrow(/id of the post that was sent/);
    const replied = await queue.recordReply(
      OWNER,
      item.id,
      { externalPostId: 'x-900', url: 'https://x.com/genfeedai/status/900' },
      NOW,
    );

    expect(replied.state).toBe('replied');
    await expect(
      queue.recordReply(OWNER, item.id, { externalPostId: 'x-901' }, NOW),
    ).rejects.toThrow(/already has a reply/);
  });

  it('refuses to draft or dismiss what was already decided', async () => {
    const { queue } = setup();
    await queue.ingest(OWNER, [post('1')], NOW);
    const [item] = await queue.list(OWNER, NOW);
    await queue.recordReply(OWNER, item.id, { externalPostId: 'x-900' }, NOW);

    await expect(queue.prepareDraft(OWNER, item.id, NOW)).rejects.toThrow(
      /no longer open/,
    );
    await expect(queue.dismiss(OWNER, item.id)).rejects.toThrow(
      /already been decided/,
    );
  });

  it('does not find an opportunity that is not a conversation', async () => {
    const { queue, rows } = setup();
    rows.set('plain', {
      id: 'plain',
      metadata: {},
      sourceType: 'trend',
      status: 'queued',
    } as unknown as AgentStrategyOpportunityDocument);

    await expect(queue.dismiss(OWNER, 'plain')).rejects.toThrow(/not found/);
  });
});
