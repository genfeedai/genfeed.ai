import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const ORG = '/test-org/~';
const MASTER_ID = 'master-thread-e2e';
const WORKING_ID = 'child-working-e2e';
const REVIEW_ID = 'child-review-e2e';
const now = '2026-10-29T10:00:00.000Z';

interface MockThread {
  attentionState?: 'running' | 'needs-input' | 'updated' | null;
  id: string;
  runStatus?: 'queued' | 'running' | 'waiting_input' | 'completed';
  kind: 'master' | 'thread';
  parentThreadId: string | null;
  title: string;
}

const THREADS: MockThread[] = [
  {
    id: MASTER_ID,
    kind: 'master',
    parentThreadId: null,
    title: 'Master',
  },
  {
    attentionState: 'running',
    id: WORKING_ID,
    runStatus: 'running',
    kind: 'thread',
    parentThreadId: MASTER_ID,
    title: 'Launch teaser cut',
  },
  {
    attentionState: 'updated',
    id: REVIEW_ID,
    kind: 'thread',
    parentThreadId: MASTER_ID,
    title: 'Carousel for the speaker drop',
  },
];

function toResource(thread: MockThread) {
  return {
    attributes: {
      attentionState: thread.attentionState ?? null,
      brandId: null,
      contextVersion: 3,
      createdAt: now,
      kind: thread.kind,
      parentThreadId: thread.parentThreadId,
      runStatus: thread.runStatus ?? null,
      source: 'agent',
      status: 'active',
      title: thread.title,
      updatedAt: now,
    },
    id: thread.id,
    type: 'threads',
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

interface AgentMock {
  steers: Array<Record<string, unknown>>;
}

/** Serves the master, the thread list, one child's transcript and the steer ack. */
async function mockMasterAndThreads(page: Page): Promise<AgentMock> {
  const mock: AgentMock = { steers: [] };

  await page.route('**/agent/threads**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(
      /^.*\/agent\/threads/,
      '',
    );

    if (request.method() === 'POST' && path.endsWith('/turns/stream')) {
      const body = request.postDataJSON() as Record<string, unknown>;
      mock.steers.push(body);
      await fulfillJson(
        route,
        {
          brandId: null,
          clientRequestId: body.clientRequestId ?? 'crid-e2e',
          contextId: 'ctx-e2e',
          contextVersion: 4,
          executionId: 'exec-steer-e2e',
          queuedAt: now,
          status: 'queued',
          threadId: path.split('/')[1],
        },
        202,
      );
      return;
    }

    const contextMatch = path.match(/^\/([^/]+)\/context$/);
    if (request.method() === 'PATCH' && contextMatch) {
      const thread = THREADS.find((item) => item.id === contextMatch[1]);
      await fulfillJson(route, { data: toResource(thread ?? THREADS[0]) });
      return;
    }

    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }

    const snapshotMatch = path.match(/^\/([^/]+)\/snapshot$/);
    if (snapshotMatch) {
      const thread = THREADS.find((item) => item.id === snapshotMatch[1]);
      await fulfillJson(route, {
        activeRun: null,
        lastAssistantMessage: null,
        lastSequence: 1,
        latestProposedPlan: null,
        latestUiBlocks: null,
        memorySummaryRefs: [],
        pendingApprovals: [],
        pendingInputRequests: [],
        profileSnapshot: null,
        sessionBinding: null,
        source: 'agent',
        threadId: snapshotMatch[1],
        threadStatus: 'active',
        timeline: [],
        title: thread?.title ?? 'Thread',
      });
      return;
    }

    if (path === '/master') {
      await fulfillJson(route, { data: toResource(THREADS[0]) });
      return;
    }

    if (path === '' || path === '/') {
      await fulfillJson(route, {
        data: THREADS.map(toResource),
        meta: { page: 1, pageSize: THREADS.length, totalCount: THREADS.length },
      });
      return;
    }

    const messagesMatch = path.match(/^\/([^/]+)\/messages$/);
    if (messagesMatch) {
      const [, threadId] = messagesMatch;
      const messages =
        threadId === REVIEW_ID
          ? [
              {
                attributes: {
                  content: 'Make a carousel for the speaker drop',
                  createdAt: now,
                  metadata: {},
                  role: 'user',
                },
                id: 'review-message-1',
                type: 'thread-message',
              },
              {
                attributes: {
                  content: 'Five slides drafted, ready for your review.',
                  createdAt: now,
                  metadata: {},
                  role: 'assistant',
                },
                id: 'review-message-2',
                type: 'thread-message',
              },
            ]
          : [];
      await fulfillJson(route, {
        data: messages,
        meta: {
          page: 1,
          pageSize: messages.length,
          totalCount: messages.length,
        },
      });
      return;
    }

    const threadMatch = path.match(/^\/([^/]+)$/);
    const thread = threadMatch
      ? THREADS.find((candidate) => candidate.id === threadMatch[1])
      : undefined;
    if (thread) {
      await fulfillJson(route, { data: toResource(thread) });
      return;
    }

    await route.fallback();
  });

  return mock;
}

test.describe('Agent master thread and Threads panel', () => {
  test.setTimeout(120_000);

  test('shows the master and Threads side by side, and steers a thread from the panel', async ({
    authenticatedPage: page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ height: 900, width: 1440 });
    const mock = await mockMasterAndThreads(page);

    await page.goto(`${ORG}/agent`);
    await assertNoErrorBoundaryFallback(page);

    // Master on the left, the Threads panel on the right, each half the page.
    const agent = page.getByTestId('agent-output-agent-pane');
    const output = page.getByTestId('agent-output-output-pane');
    await expect(agent).toBeVisible();
    await expect(output).toBeVisible();
    const [agentBox, outputBox] = await Promise.all([
      agent.boundingBox(),
      output.boundingBox(),
    ]);
    expect(agentBox?.x ?? 0).toBeLessThan(outputBox?.x ?? 0);
    expect(
      Math.abs((agentBox?.width ?? 0) - (outputBox?.width ?? 0)),
    ).toBeLessThanOrEqual(2);

    // The Conversations menu is gone from the left nav.
    await expect(page.getByTestId('agent-thread-list-content')).toHaveCount(0);
    await expect(page.getByText('Conversations', { exact: true })).toHaveCount(
      0,
    );

    // The master never lists itself; its children sit in their groups.
    const panel = output.getByTestId('agent-threads-panel');
    await expect(panel).toBeVisible();
    await expect(
      panel.getByTestId(`agent-threads-panel-thread-${MASTER_ID}`),
    ).toHaveCount(0);
    await expect(
      panel
        .getByTestId('agent-threads-panel-group-working')
        .getByTestId(`agent-threads-panel-thread-${WORKING_ID}`),
    ).toBeVisible();
    await expect(
      panel
        .getByTestId('agent-threads-panel-group-readyForReview')
        .getByTestId(`agent-threads-panel-thread-${REVIEW_ID}`),
    ).toBeVisible();

    // Open a thread: it reads in place and says the master started it.
    await panel.getByTestId(`agent-threads-panel-thread-${REVIEW_ID}`).click();
    const lightView = output.getByTestId('agent-thread-light-view');
    await expect(lightView).toBeVisible();
    await expect(
      lightView.getByTestId('agent-thread-started-by'),
    ).toBeVisible();
    await expect(lightView).toContainText(
      'Five slides drafted, ready for your review.',
    );

    // Steer it without leaving the page.
    await lightView
      .getByRole('textbox', { name: 'Steer this thread' })
      .fill('Make slide 3 shorter');
    await lightView.getByRole('button', { name: 'Steer', exact: true }).click();
    await expect(lightView.getByRole('status')).toHaveText('Sent.');
    expect(mock.steers).toHaveLength(1);
    expect(mock.steers[0]).toMatchObject({
      content: 'Make slide 3 shorter',
      expectedContextVersion: 3,
      source: 'agent',
    });
    await expect(page).toHaveURL(/\/agent\/?$/);

    // Back to the list.
    await lightView.getByRole('button', { name: 'Back' }).click();
    await expect(lightView).toHaveCount(0);
    await expect(panel).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
