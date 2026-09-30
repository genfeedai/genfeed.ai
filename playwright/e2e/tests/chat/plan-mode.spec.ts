import { orgPath } from '@e2e/utils/app-chrome';
import { AgentThreadMode } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { AgentPage } from '../../pages/agent.page';
import { exactUrlPattern } from '../../utils/exact-url';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

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

function wrapResourceInJsonApi<T>(item: T, type: string, id: string) {
  return {
    data: {
      attributes: item,
      id,
      type,
    },
  };
}

async function mockAgentCredits(page: Page): Promise<void> {
  await page.route('**/agent/credits', async (route) => {
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

async function mockActiveRuns(page: Page): Promise<void> {
  await page.route('**/runs/active', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [] }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

async function mockEmptyAgentThreads(page: Page): Promise<void> {
  await page.route(/\/threads(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      body: JSON.stringify(wrapCollectionInJsonApi([], 'threads', 'thread')),
      contentType: 'application/json',
      status: 200,
    });
  });
}

type ProposedPlan = {
  awaitingApproval?: boolean;
  content?: string;
  createdAt: string;
  id: string;
  lastReviewAction?: string;
  revisionNote?: string;
  status?: string;
  updatedAt: string;
};

async function mockThreadView(
  page: Page,
  threadId: string,
  proposedPlan: ProposedPlan,
): Promise<void> {
  await page.route(`**/threads/${threadId}`, async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        wrapResourceInJsonApi(
          {
            brandId: null,
            contextVersion: 1,
            createdAt: proposedPlan.createdAt,
            id: threadId,
            mode: AgentThreadMode.PLAN,
            status: 'active',
            title: 'Plan mode thread',
            updatedAt: proposedPlan.updatedAt,
          },
          'threads',
          threadId,
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(`**/threads/${threadId}/messages**`, async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi([], 'thread-message', 'message'),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(`**/threads/${threadId}/snapshot`, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeRun: null,
        lastAssistantMessage: null,
        lastSequence: 0,
        latestProposedPlan: proposedPlan,
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
        title: 'Plan mode thread',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * The real send path is async: `POST /agent/threads/turns/stream` only
 * acknowledges the turn (`AgentChatStreamResponse` — no message content), the
 * client pushes to the thread route on `response.threadId`, and the
 * assistant's proposed plan is normally delivered over the run's socket
 * channel. E2E has no socket double, so every spec here pre-seeds the
 * thread's REST endpoints with the final state and either reloads to hydrate
 * from the snapshot (the "(reload)" test), or waits for the app's own
 * reconciliation watchdog to poll `GET .../messages` and apply the result
 * with no navigation at all (the "(live, no navigation)" test).
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
  await agentPage.enablePlanMode();
  const expectedThreadUrl = orgPath(`${APP_ROUTES.AGENT.ROOT}/${threadId}`);
  const expectedThreadUrlPattern = exactUrlPattern(
    expectedThreadUrl,
    authenticatedPage.url(),
  );

  await agentPage.sendPrompt(prompt);
  await expect(authenticatedPage).toHaveURL(expectedThreadUrlPattern);
  await assertNoErrorBoundaryFallback(authenticatedPage, expectedThreadUrl);
  return expectedThreadUrl;
}

test.describe('Agent Plan Mode', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockAgentCredits(authenticatedPage);
    await mockActiveRuns(authenticatedPage);
    await mockEmptyAgentThreads(authenticatedPage);
  });

  test('proposes a plan, waits for approval, then executes after approve (reload)', async ({
    authenticatedPage,
  }) => {
    const agentPage = new AgentPage(authenticatedPage);
    const threadId = 'thread-plan-mode-e2e';
    const proposedPlan = {
      awaitingApproval: true,
      content:
        '1. Add a visible thread-level plan mode toggle.\n2. Pause execution after the plan is proposed.\n3. Add approve and revise controls.',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'plan-e2e-1',
      status: 'awaiting_approval',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };
    let capturedUiAction:
      | {
          action: string;
          payload?: Record<string, unknown>;
        }
      | undefined;

    await mockThreadView(authenticatedPage, threadId, proposedPlan);
    const turnAck = await mockTurnAck(authenticatedPage, threadId);

    // `POST .../ui-actions` only acks the enqueued workflow (see
    // `AgentUiActionAckResponse`) -- it never carries a message. The run it
    // starts is adopted into the thread stream like a turn, and its reply
    // arrives as that run's `agent:done`. E2E has no socket double, so the
    // run completion watchdog resolves it from `GET .../messages` by the
    // reply's `runId` -- this route (registered after `mockThreadView`'s,
    // which it supersedes) grows the post-approval message once the ack
    // fires, the way the real run persists it.
    let postApprovalMessage: Record<string, unknown> | null = null;

    await authenticatedPage.route(
      `**/threads/${threadId}/messages**`,
      async (route) => {
        await route.fulfill({
          body: JSON.stringify(
            wrapCollectionInJsonApi(
              postApprovalMessage ? [postApprovalMessage] : [],
              'thread-message',
              'message',
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
        capturedUiAction = route.request().postDataJSON() as {
          action: string;
          payload?: Record<string, unknown>;
        };
        postApprovalMessage = {
          content:
            'Executed the approved plan. The toggle, review state, and UI actions are now wired.',
          createdAt: new Date().toISOString(),
          // The run's reply carries its execution id — the client correlates
          // the ack with it.
          metadata: { runId: 'exec-ui-action-e2e' },
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
      'Add plan mode to the agent workspace',
    );

    expect(turnAck.request?.agentMode).toBe(AgentThreadMode.PLAN);
    expect(turnAck.request?.content).toContain(
      'Add plan mode to the agent workspace',
    );

    // The proposed plan normally arrives over the run's socket channel,
    // which has no E2E double — reload in place (never re-navigate: the URL
    // is already asserted exact above) to hydrate it from the pre-seeded
    // snapshot instead. The live, no-navigation path is covered separately
    // below.
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
    await assertNoErrorBoundaryFallback(authenticatedPage, threadUrl);

    await expect(agentPage.planReviewCard).toBeVisible();
    await expect(agentPage.planReviewCard).toContainText(
      'Pause execution after the plan is proposed',
    );

    await agentPage.approvePlanButton.click();

    // The watchdog resolves the adopted run after
    // `STREAM_COMPLETION_POLL_INTERVAL_MS` (10s). The thread list previews the
    // same reply, so assert it in the conversation itself.
    await expect(
      authenticatedPage
        .getByTestId('agent-conversation-column')
        .getByText(
          'Executed the approved plan. The toggle, review state, and UI actions are now wired.',
        ),
    ).toBeVisible({ timeout: 20_000 });

    // respondToUiAction sends the thread's brandId/contextVersion alongside
    // the action (see agent-chat-container.ui-actions.ts).
    expect(capturedUiAction).toEqual({
      action: 'approve_plan',
      brandId: null,
      expectedContextVersion: 1,
      payload: {
        planId: 'plan-e2e-1',
      },
    });
  });

  test('proposes a plan and renders it live, without navigating', async ({
    authenticatedPage,
  }) => {
    const agentPage = new AgentPage(authenticatedPage);
    const threadId = 'thread-plan-mode-live-e2e';
    const proposedPlan = {
      awaitingApproval: true,
      content:
        '1. Add a visible thread-level plan mode toggle.\n2. Pause execution after the plan is proposed.\n3. Add approve and revise controls.',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'plan-e2e-live-1',
      status: 'awaiting_approval',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };

    await mockThreadView(authenticatedPage, threadId, proposedPlan);
    await mockTurnAck(authenticatedPage, threadId);

    // Override `mockThreadView`'s empty messages list: the reconciliation
    // watchdog (see below) only ever refetches messages, so the recovered
    // assistant message — not the snapshot — is what must carry the plan.
    // `agent-chat.store.ts`'s `setMessages` derives `latestProposedPlan` from
    // the last message with `metadata.proposedPlan`
    // (`deriveLatestProposedPlanFromMessages`).
    await authenticatedPage.route(
      `**/threads/${threadId}/messages**`,
      async (route) => {
        await route.fulfill({
          body: JSON.stringify(
            wrapCollectionInJsonApi(
              [
                {
                  content:
                    'I drafted a plan and paused here for your approval. Review it, then approve or request changes.',
                  createdAt: proposedPlan.createdAt,
                  // Stamped with the turn's execution id, as the server
                  // persists it; the watchdog matches the run by it.
                  metadata: {
                    proposedPlan,
                    reviewRequired: true,
                    runId: `exec-${threadId}`,
                  },
                  role: 'assistant',
                },
              ],
              // Matches `ThreadMessageSerializer`: resource type is
              // 'thread-message', and `threadId` is never an attribute --
              // the client fills it in client-side from the request URL.
              'thread-message',
              'message',
            ),
          ),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await sendAndAwaitThreadRoute(
      authenticatedPage,
      agentPage,
      threadId,
      'Add plan mode to the agent workspace',
    );

    // No reload, no re-navigation: this exercises the app's own
    // reconciliation path. `scheduleCompletionWatchdog` (armed right after
    // the turn ack) polls `GET .../messages` after
    // `STREAM_COMPLETION_POLL_INTERVAL_MS` (10s) and applies the result via
    // `setMessages` when it finds a new assistant message — the same
    // mechanism production relies on when a socket reconnect is needed. A
    // regression in that reconciliation path fails only this test, not the
    // "(reload)" one above, which bypasses it entirely.
    await expect(agentPage.planReviewCard).toBeVisible({ timeout: 15_000 });
    await expect(agentPage.planReviewCard).toContainText(
      'Pause execution after the plan is proposed',
    );
  });

  test('requests plan changes and keeps execution paused (reload)', async ({
    authenticatedPage,
  }) => {
    const agentPage = new AgentPage(authenticatedPage);
    const threadId = 'thread-plan-mode-revise-e2e';
    const initialPlan = {
      awaitingApproval: true,
      content: '1. Add a plan mode toggle.\n2. Add approval controls.',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'plan-e2e-2',
      status: 'awaiting_approval',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };
    let capturedUiAction:
      | {
          action: string;
          payload?: Record<string, unknown>;
        }
      | undefined;

    await mockThreadView(authenticatedPage, threadId, initialPlan);
    await mockTurnAck(authenticatedPage, threadId);

    // `POST .../ui-actions` only acks the enqueued workflow -- the run's
    // reply arrives as its `agent:done`, or here, with no socket double,
    // through the run completion watchdog reading `GET .../messages`. This
    // route (registered after `mockThreadView`'s, which it supersedes) grows
    // the revised-plan message once the ack fires.
    let postRevisionMessage: Record<string, unknown> | null = null;

    await authenticatedPage.route(
      `**/threads/${threadId}/messages**`,
      async (route) => {
        await route.fulfill({
          body: JSON.stringify(
            wrapCollectionInJsonApi(
              postRevisionMessage ? [postRevisionMessage] : [],
              'thread-message',
              'message',
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
        capturedUiAction = route.request().postDataJSON() as {
          action: string;
          payload?: Record<string, unknown>;
        };
        postRevisionMessage = {
          content:
            'I revised the plan and kept execution paused for another review.',
          createdAt: new Date().toISOString(),
          metadata: {
            runId: 'exec-ui-action-e2e',
            proposedPlan: {
              ...initialPlan,
              content:
                '1. Add a thread-level plan mode toggle.\n2. Add an awaiting approval status.\n3. Keep execution paused until explicit approval.',
              lastReviewAction: 'request_changes',
              revisionNote:
                'Show clearer plan status in the conversation and keep execution paused.',
              updatedAt: '2026-03-26T10:05:00.000Z',
            },
            reviewRequired: true,
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
      'Add plan mode to the agent workspace',
    );

    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
    await assertNoErrorBoundaryFallback(authenticatedPage, threadUrl);

    await expect(agentPage.planReviewCard).toBeVisible();
    await agentPage.revisionNoteInput.fill(
      'Show clearer plan status in the conversation and keep execution paused.',
    );
    await agentPage.requestPlanChangesButton.click();

    await expect(agentPage.planReviewCard).toContainText(
      'Keep execution paused until explicit approval',
      { timeout: 20_000 },
    );
    // The thread list previews the same reply; assert it in the conversation.
    await expect(
      authenticatedPage
        .getByTestId('agent-conversation-column')
        .getByText(
          'I revised the plan and kept execution paused for another review.',
        ),
    ).toBeVisible();
    await expect(agentPage.planReviewCard).toContainText('Awaiting approval');

    // respondToUiAction sends the thread's brandId/contextVersion alongside
    // the action (see agent-chat-container.ui-actions.ts).
    expect(capturedUiAction).toEqual({
      action: 'revise_plan',
      brandId: null,
      expectedContextVersion: 1,
      payload: {
        planId: 'plan-e2e-2',
        revisionNote:
          'Show clearer plan status in the conversation and keep execution paused.',
      },
    });
  });
});
