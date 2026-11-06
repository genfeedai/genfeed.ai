import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const ORG = '/test-org/~';
const MASTER_ID = 'master-layout-e2e';
const CHILD_ID = 'child-layout-e2e';
const SPLIT_STORAGE_KEY = 'genfeed:agent-master-split';
const now = '2026-11-06T14:00:00.000Z';

const LONG_REPLY = [
  'Here is where the week stands.',
  '',
  '- Monday: two posts drafted and waiting in review.',
  '- Tuesday: one carousel queued for 09:00.',
  '- Wednesday: nothing yet, a good slot for a video.',
  '- Thursday: the launch thread goes out at 14:00.',
  '- Friday: one recap post, drafted from the analytics.',
  '',
  'Tell me which slot to fill first and I will draft it.',
].join('\n');

function threadResource(
  id: string,
  kind: 'master' | 'thread',
  title: string,
): Record<string, unknown> {
  return {
    attributes: {
      attentionState: null,
      brandId: null,
      contextVersion: 3,
      createdAt: now,
      kind,
      mode: 'plan',
      parentThreadId: kind === 'master' ? null : MASTER_ID,
      runStatus: null,
      source: 'agent',
      status: 'active',
      title,
      updatedAt: now,
    },
    id,
    type: 'threads',
  };
}

/** Eight turns, the last ending on an approved plan, so the master scrolls. */
function masterMessages(): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  for (const turn of [1, 2, 3, 4, 5, 6, 7, 8]) {
    messages.push({
      attributes: {
        content: `Schedule my posts for the week, take ${turn}`,
        createdAt: now,
        metadata: {},
        role: 'user',
      },
      id: `layout-user-${turn}`,
      type: 'thread-message',
    });
    messages.push({
      attributes: {
        content: LONG_REPLY,
        createdAt: now,
        metadata:
          turn === 8
            ? {
                proposedPlan: {
                  content:
                    'Pull the review queue, then schedule the approved drafts for the week.',
                  createdAt: now,
                  id: 'plan-1762437600000',
                  status: 'approved',
                  updatedAt: now,
                },
              }
            : {},
        role: 'assistant',
      },
      id: `layout-assistant-${turn}`,
      type: 'thread-message',
    });
  }
  return messages;
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  });
}

// The composer stays disabled until the agent socket connects: complete only
// the socket.io handshake.
async function mockAgentSocketHandshake(page: Page): Promise<void> {
  await page.addInitScript(() =>
    Object.assign(window, { __playwright_socket_fixture: true }),
  );
  await page.routeWebSocket('**/socket.io/**', (connection) => {
    connection.send(
      `0${JSON.stringify({
        maxPayload: 1000000,
        pingInterval: 25000,
        pingTimeout: 20000,
        sid: 'layout-e2e',
        upgrades: [],
      })}`,
    );
    connection.onMessage((message) => {
      if (typeof message === 'string' && message.startsWith('40')) {
        connection.send('40{"sid":"layout-e2e"}');
      }
      if (message === '2') {
        connection.send('3');
      }
    });
  });
}

async function mockMaster(page: Page): Promise<void> {
  const threads = [
    threadResource(MASTER_ID, 'master', 'Master'),
    threadResource(CHILD_ID, 'thread', 'Price a week of posts'),
  ];

  await page.route('**/agent/threads**', async (route) => {
    const request = route.request();
    // `/agent/threads` is also a page URL: only API calls are mocked.
    if (
      request.isNavigationRequest() ||
      new URL(request.url()).searchParams.has('_rsc') ||
      request.headers().rsc === '1' ||
      request.method() !== 'GET'
    ) {
      await route.fallback();
      return;
    }
    const path = new URL(request.url()).pathname.replace(
      /^.*\/agent\/threads/,
      '',
    );

    if (path === '/master') {
      await fulfillJson(route, { data: threads[0] });
      return;
    }
    if (path === '' || path === '/') {
      await fulfillJson(route, {
        data: threads,
        meta: { page: 1, pageSize: threads.length, totalCount: threads.length },
      });
      return;
    }
    const snapshotMatch = path.match(/^\/([^/]+)\/snapshot$/);
    if (snapshotMatch) {
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
        title: 'Master',
      });
      return;
    }
    const messagesMatch = path.match(/^\/([^/]+)\/messages$/);
    if (messagesMatch) {
      const messages = messagesMatch[1] === MASTER_ID ? masterMessages() : [];
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
    const thread = threads.find((item) => item.id === threadMatch?.[1]);
    if (thread) {
      await fulfillJson(route, { data: thread });
      return;
    }
    await route.fallback();
  });
}

async function openMaster(page: Page): Promise<void> {
  await page.setViewportSize({ height: 900, width: 1440 });
  await mockAgentSocketHandshake(page);
  await mockMaster(page);
  await page.goto(`${ORG}/agent`);
  await assertNoErrorBoundaryFallback(page);
  await expect(
    page.getByText('Schedule my posts for the week, take 8'),
  ).toBeVisible();
}

test.describe('Agent master conversation layout', () => {
  test.setTimeout(120_000);

  test('keeps the prompt bar anchored while the transcript scrolls', async ({
    authenticatedPage: page,
  }) => {
    await openMaster(page);
    const pane = page.getByTestId('agent-output-agent-pane');
    const composer = pane.getByTestId('agent-column-composer');
    // The transcript scroll is the composer's sibling, never its parent.
    const scroll = composer.locator('xpath=preceding-sibling::div[1]');

    const paneBox = await pane.boundingBox();
    const composerAtBottom = await composer.boundingBox();
    // The prompt bar is the foot of the pane, not a row in the transcript.
    expect(
      Math.abs(
        (paneBox?.y ?? 0) +
          (paneBox?.height ?? 0) -
          ((composerAtBottom?.y ?? 0) + (composerAtBottom?.height ?? 0)),
      ),
    ).toBeLessThanOrEqual(2);

    // Scrolling the transcript to the top moves neither the prompt bar nor any
    // pinned prompt: nothing in the transcript sticks.
    await scroll.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect(
      page.getByText('Schedule my posts for the week, take 1'),
    ).toBeInViewport();
    const composerAtTop = await composer.boundingBox();
    expect(composerAtTop?.y).toBe(composerAtBottom?.y);
    await expect(pane.locator('.sticky')).toHaveCount(0);

    // No prompt minimap beside the transcript.
    await expect(
      page.getByRole('navigation', { name: 'Conversation prompts' }),
    ).toHaveCount(0);
  });

  test('shows a user message as a bubble on the right with its time attached', async ({
    authenticatedPage: page,
  }) => {
    await openMaster(page);
    const pane = page.getByTestId('agent-output-agent-pane');
    const bubble = pane
      .locator('[data-message-role="user"]')
      .filter({ hasText: 'take 8' });
    const paneBox = await pane.boundingBox();
    const bubbleBox = await bubble.boundingBox();

    // Right-aligned and sized to its text, not a full-width bar.
    expect((bubbleBox?.x ?? 0) + (bubbleBox?.width ?? 0)).toBeGreaterThan(
      (paneBox?.x ?? 0) + (paneBox?.width ?? 0) / 2,
    );
    expect(bubbleBox?.width ?? 0).toBeLessThan((paneBox?.width ?? 0) * 0.6);

    // The time sits right under the bubble and shows on hover.
    const footer = bubble
      .locator('xpath=..')
      .getByTestId('agent-message-footer');
    await bubble.hover();
    await expect(footer).toHaveCSS('opacity', '1');
    const footerBox = await footer.boundingBox();
    expect(
      (footerBox?.y ?? 0) - ((bubbleBox?.y ?? 0) + (bubbleBox?.height ?? 0)),
    ).toBeLessThanOrEqual(4);
  });

  test('resizes the master and Threads panes from the divider and remembers it', async ({
    authenticatedPage: page,
  }) => {
    await openMaster(page);
    const agent = page.getByTestId('agent-output-agent-pane');
    const divider = page.getByRole('separator', { name: 'Resize panes' });
    const before = await agent.boundingBox();
    const handle = await divider.boundingBox();

    await page.mouse.move(
      (handle?.x ?? 0) + (handle?.width ?? 0) / 2,
      (handle?.y ?? 0) + 200,
    );
    await page.mouse.down();
    await page.mouse.move((handle?.x ?? 0) + 200, (handle?.y ?? 0) + 200, {
      steps: 8,
    });
    await page.mouse.up();

    // The divider reports the agent's share; the pane follows it.
    const share = Number(await divider.getAttribute('aria-valuenow'));
    expect(share).toBeGreaterThan(55);
    const paneWidthAt = async (): Promise<number> =>
      (await agent.boundingBox())?.width ?? 0;
    // Half and half at the start, so the two panes are twice the agent's.
    const expectedWidth = ((before?.width ?? 0) * 2 * share) / 100;
    expect(expectedWidth - (before?.width ?? 0)).toBeGreaterThan(150);
    await expect
      .poll(async () => Math.abs((await paneWidthAt()) - expectedWidth))
      .toBeLessThanOrEqual(8);
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      SPLIT_STORAGE_KEY,
    );
    expect(Math.round(Number(stored) * 100)).toBe(share);

    // A reload keeps the split.
    await page.reload();
    await expect(
      page.getByText('Schedule my posts for the week, take 8'),
    ).toBeVisible();
    await expect(divider).toHaveAttribute('aria-valuenow', String(share));
    await expect
      .poll(async () => Math.abs((await paneWidthAt()) - expectedWidth))
      .toBeLessThanOrEqual(8);

    // Double-click goes back to half and half.
    await divider.dblclick();
    await expect(divider).toHaveAttribute('aria-valuenow', '50');
    await expect
      .poll(async () => Math.abs((await paneWidthAt()) - (before?.width ?? 0)))
      .toBeLessThanOrEqual(2);
  });
});
