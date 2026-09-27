import { orgPath } from '@e2e/utils/app-chrome';
import { AgentThreadMode } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { AgentPage } from '../../pages/agent.page';
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

async function mockThreadView(
  page: Page,
  threadId: string,
  proposedPlan: {
    awaitingApproval?: boolean;
    content?: string;
    createdAt: string;
    id: string;
    status?: string;
    updatedAt: string;
  },
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
      body: JSON.stringify(wrapCollectionInJsonApi([], 'messages', 'message')),
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
 * assistant's proposed plan is delivered over the run's socket channel. E2E
 * has no socket double — like `chat/onboarding.spec.ts`, this pre-seeds the
 * thread's REST endpoints (snapshot's `latestProposedPlan`) with the final
 * state and navigates there directly after the URL promotes.
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

test.describe('Agent Plan Mode', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockAgentCredits(authenticatedPage);
    await mockActiveRuns(authenticatedPage);
    await mockEmptyAgentThreads(authenticatedPage);
  });

  test('proposes a plan, waits for approval, then executes after approve', async ({
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

    await authenticatedPage.route(
      `**/threads/${threadId}/ui-actions`,
      async (route: Route) => {
        capturedUiAction = route.request().postDataJSON() as {
          action: string;
          payload?: Record<string, unknown>;
        };

        await route.fulfill({
          body: JSON.stringify({
            brandId: null,
            contextVersion: 1,
            creditsRemaining: 116,
            creditsUsed: 2,
            message: {
              content:
                'Executed the approved plan. The toggle, review state, and UI actions are now wired.',
              metadata: {},
              role: 'assistant',
            },
            threadId,
            toolCalls: [],
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await agentPage.goto();
    await assertNoErrorBoundaryFallback(authenticatedPage, agentPage.url);
    await agentPage.enablePlanMode();
    await agentPage.sendPrompt('Add plan mode to the agent workspace');

    // Assert on the thread-route suffix only: `activeHref` picks a
    // brand-scoped vs. org-only prefix depending on brand-context timing,
    // which is orthogonal to what this test verifies (the turn ack promoted
    // the URL to the thread the app just created).
    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${APP_ROUTES.AGENT.ROOT}/${threadId}$`),
    );

    expect(turnAck.request?.agentMode).toBe(AgentThreadMode.PLAN);
    expect(turnAck.request?.content).toContain(
      'Add plan mode to the agent workspace',
    );

    // The proposed plan is delivered over the run's socket channel, which has
    // no E2E double — navigate to the known-good org-scoped thread URL (the
    // client's own `activeHref` push above may have resolved a stale/loading
    // brand slug) to hydrate it from the pre-seeded snapshot instead.
    const threadUrl = orgPath(`${APP_ROUTES.AGENT.ROOT}/${threadId}`);
    await authenticatedPage.goto(threadUrl, { waitUntil: 'domcontentloaded' });
    await assertNoErrorBoundaryFallback(authenticatedPage, threadUrl);

    await expect(agentPage.planReviewCard).toBeVisible();
    await expect(agentPage.planReviewCard).toContainText(
      'Pause execution after the plan is proposed',
    );

    await agentPage.approvePlanButton.click();

    await expect(
      authenticatedPage.getByText(
        'Executed the approved plan. The toggle, review state, and UI actions are now wired.',
      ),
    ).toBeVisible();

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

  test('requests plan changes and keeps execution paused', async ({
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

    await authenticatedPage.route(
      `**/threads/${threadId}/ui-actions`,
      async (route: Route) => {
        capturedUiAction = route.request().postDataJSON() as {
          action: string;
          payload?: Record<string, unknown>;
        };

        await route.fulfill({
          body: JSON.stringify({
            brandId: null,
            contextVersion: 1,
            creditsRemaining: 116,
            creditsUsed: 2,
            message: {
              content:
                'I revised the plan and kept execution paused for another review.',
              metadata: {
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
            },
            threadId,
            toolCalls: [],
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await agentPage.goto();
    await assertNoErrorBoundaryFallback(authenticatedPage, agentPage.url);
    await agentPage.enablePlanMode();
    await agentPage.sendPrompt('Add plan mode to the agent workspace');

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${APP_ROUTES.AGENT.ROOT}/${threadId}$`),
    );

    const threadUrl = orgPath(`${APP_ROUTES.AGENT.ROOT}/${threadId}`);
    await authenticatedPage.goto(threadUrl, { waitUntil: 'domcontentloaded' });
    await assertNoErrorBoundaryFallback(authenticatedPage, threadUrl);

    await expect(agentPage.planReviewCard).toBeVisible();
    await agentPage.revisionNoteInput.fill(
      'Show clearer plan status in the conversation and keep execution paused.',
    );
    await agentPage.requestPlanChangesButton.click();

    await expect(agentPage.planReviewCard).toContainText(
      'Keep execution paused until explicit approval',
    );
    await expect(
      authenticatedPage.getByText(
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
