import { orgPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { AgentPage } from '../../pages/agent.page';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

function wrapInJsonApi<T>(data: T, type: string, id: string) {
  return {
    data: {
      attributes: data,
      id,
      type,
    },
  };
}

function wrapCollectionInJsonApi<T>(
  items: T[],
  type: string,
  idPrefix: string,
) {
  return {
    data: items.map((item, index) => ({
      attributes: item,
      id: `${idPrefix}-${index}`,
      type,
    })),
    meta: {
      page: 1,
      pageSize: items.length,
      totalCount: items.length,
    },
  };
}

function mockAgentCredits(page: Page): Promise<void> {
  return page.route('**/agent/credits', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        balance: 120,
        modelCosts: {
          'gpt-5-mini': 2,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

function mockActiveRuns(page: Page): Promise<void> {
  return page.route('**/runs/active', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [] }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * The real send path is async: `POST /agent/threads/turns/stream` only
 * acknowledges the turn (`AgentChatStreamResponse` — no message content), the
 * client pushes to the org-scoped thread route on `response.threadId`, and
 * the assistant reply is normally delivered over the run's socket channel.
 * E2E has no socket double, so every spec here pre-seeds the thread's REST
 * endpoints (messages/snapshot) with the final state and either:
 *  - reloads to hydrate the transcript from those endpoints (fast, exercises
 *    the same GET contract as a page refresh — see the "(reload)" tests), or
 *  - waits for the app's own reconciliation watchdog
 *    (`agent-chat-stream.entry.ts`'s `scheduleCompletionWatchdog`, armed
 *    right after the ack) to poll `GET .../messages` on its own and apply
 *    the result, with no navigation at all — see the "(live, no navigation)"
 *    tests, which are the ones that would fail if `agent:done`/completion
 *    handling broke.
 */
function mockTurnAck(
  page: Page,
  threadId: string,
): Promise<{ request: Record<string, unknown> | undefined }> {
  const captured: { request: Record<string, unknown> | undefined } = {
    request: undefined,
  };

  return page
    .route('**/agent/threads/turns/stream', async (route: Route) => {
      captured.request = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      await route.fulfill({
        body: JSON.stringify({
          brandId: null,
          clientRequestId: captured.request?.clientRequestId ?? 'crid-e2e',
          contextId: 'ctx-e2e',
          contextVersion: 1,
          executionId: `exec-${threadId}`,
          queuedAt: new Date().toISOString(),
          status: 'queued',
          threadId,
        }),
        contentType: 'application/json',
        status: 202,
      });
    })
    .then(() => captured);
}

async function mockThreadReplay(
  page: Page,
  options: {
    assistantContent: string;
    threadId?: string;
    title?: string;
    uiActions?: Array<Record<string, unknown>>;
    userContent?: string;
  },
): Promise<void> {
  const threadId = options.threadId ?? 'thread-agent-e2e';
  const title = options.title ?? 'Current chat';
  const userContent = options.userContent ?? 'publish this';
  const now = new Date().toISOString();
  const threadSummary = {
    brandId: null,
    contextVersion: 1,
    createdAt: now,
    status: 'active',
    title,
    updatedAt: now,
  };

  await page.route('**/threads?**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi([threadSummary], 'threads', threadId),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(`**/threads/${threadId}**`, async (route) => {
    await route.fulfill({
      body: JSON.stringify(wrapInJsonApi(threadSummary, 'threads', threadId)),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(`**/threads/${threadId}/messages**`, async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi(
          [
            {
              content: userContent,
              createdAt: now,
              metadata: {},
              role: 'user',
            },
            {
              content: options.assistantContent,
              createdAt: now,
              metadata: {
                uiActions: options.uiActions ?? [],
              },
              role: 'assistant',
            },
          ],
          // Matches `ThreadMessageSerializer` (`thread-message.config.ts`):
          // resource type is 'thread-message', and `threadId` is never one
          // of its attributes -- the client fills it in client-side from
          // the request URL (`mapMessagesToThread`), not from the payload.
          'thread-message',
          'mock-message',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(`**/threads/${threadId}/snapshot**`, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeRun: null,
        lastAssistantMessage: {
          content: options.assistantContent,
          createdAt: now,
          messageId: 'assistant-message-1',
          metadata: {
            uiActions: options.uiActions ?? [],
          },
        },
        lastSequence: 2,
        latestProposedPlan: null,
        latestUiBlocks: null,
        memorySummaryRefs: [],
        pendingApprovals: [],
        pendingInputRequests: [],
        profileSnapshot: null,
        sessionBinding: null,
        source: 'agent',
        threadId,
        threadStatus: 'active',
        timeline: [],
        title,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Sends `prompt` from `/agent/new` and asserts the turn ack promoted the URL
 * to exactly the org-scoped `threadId` route — not just a suffix match. Every
 * test starts from the org-scoped `AgentPage.url`, and asserting the exact
 * destination here — rather than accepting any `/agent/{threadId}` suffix and
 * silently re-navigating to the expected URL — means a wrong destination
 * (the #5395 scope nondeterminism, fixed by #5414) fails the test instead of
 * being quietly repaired.
 */
async function sendAndAwaitThreadRoute(
  authenticatedPage: Page,
  agentPage: AgentPage,
  threadId: string,
  prompt: string,
): Promise<string> {
  await agentPage.goto();
  await assertNoErrorBoundaryFallback(authenticatedPage, agentPage.url);
  await agentPage.sendPrompt(prompt);

  const expectedThreadUrl = orgPath(`${APP_ROUTES.AGENT.ROOT}/${threadId}`);
  await expect(authenticatedPage).toHaveURL(
    new RegExp(`${expectedThreadUrl}$`),
  );
  await assertNoErrorBoundaryFallback(authenticatedPage, expectedThreadUrl);
  return expectedThreadUrl;
}

test.describe('Agent Chat', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockAgentCredits(authenticatedPage);
    await mockActiveRuns(authenticatedPage);
  });

  test('publishes from chat and renders follow-up CTAs (reload)', async ({
    authenticatedPage,
  }) => {
    const agentPage = new AgentPage(authenticatedPage);
    const threadId = 'thread-agent-e2e';
    const assistantContent = 'Ready to publish this post from chat.';
    const publishUiActions = [
      {
        contentId: 'ingredient-42',
        data: {
          availablePlatforms: ['linkedin', 'twitter'],
        },
        description: 'Review caption, platforms, and timing.',
        id: 'publish-card-e2e',
        platforms: ['linkedin'],
        textContent: 'Launching this from the agent.',
        title: 'Publish selected content',
        type: 'publish_post_card',
      },
    ];
    let uiActionRequest:
      | {
          action: string;
          payload?: Record<string, unknown>;
        }
      | undefined;
    // `POST .../ui-actions` only acks the enqueued workflow — it never
    // carries a message (see `AgentUiActionAckResponse`). The client
    // reconciles the eventual assistant reply by polling
    // `GET .../messages`, so this mock's `getMessages` route (registered
    // after `mockThreadReplay`'s, which it supersedes) grows a new message
    // once the ack fires, the same way the real workflow's completion would
    // append one to the thread.
    let postConfirmMessage: Record<string, unknown> | null = null;

    await mockThreadReplay(authenticatedPage, {
      assistantContent,
      threadId,
      // Distinct from the card's own title ('Publish selected content')
      // below: the thread title also renders as an sr-only heading in the
      // conversation column, and an identical string would trip strict mode
      // against the card's real, visible heading.
      title: 'Publish flow thread',
      uiActions: publishUiActions,
      userContent: 'publish this',
    });
    await mockTurnAck(authenticatedPage, threadId);

    await authenticatedPage.route(
      `**/threads/${threadId}/messages**`,
      async (route) => {
        const baseMessages = [
          {
            content: 'publish this',
            createdAt: new Date().toISOString(),
            metadata: {},
            role: 'user',
          },
          {
            content: assistantContent,
            createdAt: new Date().toISOString(),
            metadata: { uiActions: publishUiActions },
            role: 'assistant',
          },
          ...(postConfirmMessage ? [postConfirmMessage] : []),
        ];
        await route.fulfill({
          body: JSON.stringify(
            wrapCollectionInJsonApi(
              baseMessages,
              'thread-message',
              'mock-message',
            ),
          ),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await authenticatedPage.route(
      `**/threads/${threadId}/ui-actions`,
      async (route: Route) => {
        uiActionRequest = route.request().postDataJSON() as {
          action: string;
          payload?: Record<string, unknown>;
        };
        postConfirmMessage = {
          content: 'Publish confirmed. Your post is ready to review.',
          createdAt: new Date().toISOString(),
          metadata: {
            // The run's reply carries its execution id — the client
            // correlates the ack with it.
            runId: 'exec-ui-action-e2e',
            uiActions: [
              {
                ctas: [
                  {
                    href: '/content/posts',
                    label: 'Open Posts',
                  },
                  {
                    href: '/content/posts/published',
                    label: 'Open Published',
                  },
                ],
                description: 'Published successfully.',
                id: 'publish-success-preview',
                title: 'Post published from chat',
                type: 'content_preview_card',
              },
            ],
          },
          role: 'assistant',
        };

        await route.fulfill({
          body: JSON.stringify({
            executionId: 'exec-ui-action-e2e',
            status: 'queued',
            threadId,
          }),
          contentType: 'application/json',
          status: 202,
        });
      },
    );

    const threadUrl = await sendAndAwaitThreadRoute(
      authenticatedPage,
      agentPage,
      threadId,
      'publish this',
    );

    // The assistant reply normally arrives over the run's socket channel,
    // which has no E2E double — reload in place (never re-navigate: the URL
    // is already asserted exact above) to hydrate the transcript from the
    // pre-seeded messages/snapshot REST endpoints instead. The live,
    // no-navigation path is covered separately below.
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
    await assertNoErrorBoundaryFallback(authenticatedPage, threadUrl);

    const conversation = authenticatedPage.getByTestId(
      'agent-conversation-column',
    );
    await expect(
      conversation.getByText('Ready to publish this post from chat.'),
    ).toBeVisible();
    await expect(
      conversation.getByRole('heading', {
        name: 'Publish selected content',
      }),
    ).toBeVisible();

    await agentPage.platformButton('linkedin').click();
    await expect(agentPage.confirmPublishButton()).toBeDisabled();

    await agentPage.platformButton('twitter').click();
    await agentPage.publishCaption.fill('Updated launch caption');
    await agentPage.publishSchedule.fill('2026-03-12T09:30');

    await expect(
      conversation.getByRole('button', { name: 'Confirm schedule' }),
    ).toBeEnabled();
    await conversation
      .getByRole('button', { name: 'Confirm schedule' })
      .click();

    // The eventual server reply — reconciled through the async ack by its
    // runId — and its CTAs, not the card's own local success copy.
    await expect(
      conversation.getByText(
        'Publish confirmed. Your post is ready to review.',
      ),
    ).toBeVisible();
    await expect(
      conversation.getByRole('link', { name: 'Open Posts' }),
    ).toHaveAttribute('href', /\/content\/posts$/);
    await expect(
      conversation.getByRole('link', { name: 'Open Published' }),
    ).toHaveAttribute('href', /\/content\/posts\/published$/);
    // respondToUiAction sends the thread's brandId/contextVersion alongside
    // the action (see agent-chat-container.ui-actions.ts), and the card
    // normalizes the datetime-local input to an ISO instant in the browser's
    // own TZ — compute the expectation there too, not in the Node test
    // process, whose TZ may differ from the browser's configured one.
    const expectedScheduledAt = await authenticatedPage.evaluate(() =>
      new Date('2026-03-12T09:30').toISOString(),
    );
    expect(uiActionRequest).toEqual({
      action: 'confirm_publish_post',
      brandId: null,
      expectedContextVersion: 1,
      payload: {
        caption: 'Updated launch caption',
        contentId: 'ingredient-42',
        platforms: ['twitter'],
        scheduledAt: expectedScheduledAt,
        sourceActionId: 'publish-card-e2e',
        visibility: 'public',
      },
    });
  });

  test('publishes from chat and renders the reply live, without navigating', async ({
    authenticatedPage,
  }) => {
    const agentPage = new AgentPage(authenticatedPage);
    const threadId = 'thread-agent-live-e2e';
    const assistantContent = 'Ready to publish this post from chat.';
    const publishUiActions = [
      {
        contentId: 'ingredient-42',
        data: {
          availablePlatforms: ['linkedin', 'twitter'],
        },
        description: 'Review caption, platforms, and timing.',
        id: 'publish-card-e2e',
        platforms: ['linkedin'],
        textContent: 'Launching this from the agent.',
        title: 'Publish selected content',
        type: 'publish_post_card',
      },
    ];

    await mockThreadReplay(authenticatedPage, {
      assistantContent,
      threadId,
      title: 'Publish flow thread (live)',
      uiActions: publishUiActions,
      userContent: 'publish this',
    });
    await mockTurnAck(authenticatedPage, threadId);

    await sendAndAwaitThreadRoute(
      authenticatedPage,
      agentPage,
      threadId,
      'publish this',
    );

    // No reload, no re-navigation: this exercises the app's own
    // reconciliation path. `scheduleCompletionWatchdog` (armed right after
    // the turn ack) polls `GET .../messages` after
    // `STREAM_COMPLETION_POLL_INTERVAL_MS` (10s) and applies the result via
    // `setMessages` when it finds a new assistant message — the same
    // mechanism production relies on when a socket reconnect is needed. A
    // regression in that reconciliation path fails only this test, not the
    // "(reload)" one above, which bypasses it entirely.
    const conversation = authenticatedPage.getByTestId(
      'agent-conversation-column',
    );
    await expect(
      conversation.getByText('Ready to publish this post from chat.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      conversation.getByRole('heading', {
        name: 'Publish selected content',
      }),
    ).toBeVisible();
  });

  test('renders normalized analytics snapshot metrics for a published post (reload)', async ({
    authenticatedPage,
  }) => {
    const agentPage = new AgentPage(authenticatedPage);
    const threadId = 'thread-analytics-e2e';
    const assistantContent = 'Here is the latest post performance snapshot.';
    const analyticsUiActions = [
      {
        description: 'Latest published post tied to your selected ingredient.',
        id: 'analytics-post-snapshot',
        metrics: {
          items: [
            { label: 'Views', value: 12400 },
            {
              change: 8.2,
              label: 'Engagement rate',
              suffix: '%',
              value: 8.2,
            },
            { label: 'Likes', value: 380 },
            { label: 'Comments', value: 24 },
          ],
        },
        title: 'Post analytics snapshot',
        type: 'analytics_snapshot_card',
      },
    ];

    await mockThreadReplay(authenticatedPage, {
      assistantContent,
      threadId,
      // Distinct from the action's own 'Post analytics snapshot' title:
      // the thread title also renders as an sr-only heading in the
      // conversation column (`AgentChatContainerThreadView.tsx`'s
      // `<h2 className="sr-only">{activeThreadTitle}</h2>`), and an
      // identical string collides with any heading-role assertion.
      title: 'Analytics flow thread',
      uiActions: analyticsUiActions,
      userContent: 'show analytics',
    });
    await mockTurnAck(authenticatedPage, threadId);

    const threadUrl = await sendAndAwaitThreadRoute(
      authenticatedPage,
      agentPage,
      threadId,
      'show analytics',
    );

    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
    await assertNoErrorBoundaryFallback(authenticatedPage, threadUrl);

    const conversation = authenticatedPage.getByTestId(
      'agent-conversation-column',
    );
    // `AnalyticsSnapshotCard` renders a static 'Analytics summary' heading
    // (it never renders the ui-action's own `title`) — scope the metric
    // assertions to that card's container rather than the whole column.
    const analyticsHeading = conversation.getByRole('heading', {
      name: 'Analytics summary',
    });
    await expect(analyticsHeading).toBeVisible();
    // `Card` (`packages/ui/src/components/card/Card.tsx`) always renders its
    // root with a literal 'rounded-card' class -- the nearest such ancestor
    // is this action's card.
    const analyticsCard = analyticsHeading.locator(
      'xpath=ancestor::*[contains(concat(" ", @class, " "), " rounded-card ")][1]',
    );
    await expect(analyticsCard.getByText('12.4K')).toBeVisible();
    await expect(analyticsCard.getByText('8.2%').first()).toBeVisible();
    await expect(analyticsCard.getByText('380')).toBeVisible();
    await expect(analyticsCard.getByText('24')).toBeVisible();
  });

  test('shows publish fallback when selected content has no post analytics yet (reload)', async ({
    authenticatedPage,
  }) => {
    const agentPage = new AgentPage(authenticatedPage);
    const threadId = 'thread-publish-fallback-e2e';
    const assistantContent =
      'No post analytics yet for this ingredient. Publish it first.';
    const fallbackUiActions = [
      {
        contentId: 'ingredient-unpublished',
        data: {
          availablePlatforms: ['linkedin'],
        },
        description: 'Publish this content to start collecting metrics.',
        id: 'publish-fallback-card',
        platforms: ['linkedin'],
        textContent: 'Ready when you are.',
        title: 'Publish selected content',
        type: 'publish_post_card',
      },
    ];

    await mockThreadReplay(authenticatedPage, {
      assistantContent,
      threadId,
      // Distinct from the card's own title ('Publish selected content')
      // below: the thread title also renders as an sr-only heading in the
      // conversation column, and an identical string would trip strict mode
      // against the card's real, visible heading.
      title: 'Publish fallback thread',
      uiActions: fallbackUiActions,
      userContent: 'show analytics',
    });
    await mockTurnAck(authenticatedPage, threadId);

    const threadUrl = await sendAndAwaitThreadRoute(
      authenticatedPage,
      agentPage,
      threadId,
      'show analytics',
    );

    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
    await assertNoErrorBoundaryFallback(authenticatedPage, threadUrl);

    const conversation = authenticatedPage.getByTestId(
      'agent-conversation-column',
    );
    await expect(
      conversation.getByText(
        'No post analytics yet for this ingredient. Publish it first.',
      ),
    ).toBeVisible();
    await expect(
      conversation.getByRole('heading', {
        name: 'Publish selected content',
      }),
    ).toBeVisible();
    await expect(
      conversation.getByText(
        'Publish this content to start collecting metrics.',
      ),
    ).toBeVisible();
  });
});
