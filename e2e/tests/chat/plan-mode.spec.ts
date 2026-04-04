import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { ChatPage } from '../../pages/chat.page';

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
            createdAt: proposedPlan.createdAt,
            id: threadId,
            planModeEnabled: true,
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

test.describe('Agent Plan Mode', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockAgentCredits(authenticatedPage);
    await mockActiveRuns(authenticatedPage);
    await mockEmptyAgentThreads(authenticatedPage);
  });

  test('proposes a plan, waits for approval, then executes after approve', async ({
    authenticatedPage,
  }) => {
    const agentPage = new ChatPage(authenticatedPage);
    const proposedPlan = {
      awaitingApproval: true,
      content:
        '1. Add a visible thread-level plan mode toggle.\n2. Pause execution after the plan is proposed.\n3. Add approve and revise controls.',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'plan-e2e-1',
      status: 'awaiting_approval',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };
    let capturedChatRequest:
      | {
          content: string;
          planModeEnabled?: boolean;
        }
      | undefined;
    let capturedUiAction:
      | {
          action: string;
          payload?: Record<string, unknown>;
        }
      | undefined;

    await authenticatedPage.route('**/agent/chat', async (route: Route) => {
      capturedChatRequest = route.request().postDataJSON() as {
        content: string;
        planModeEnabled?: boolean;
      };

      await route.fulfill({
        body: JSON.stringify({
          creditsRemaining: 118,
          creditsUsed: 2,
          message: {
            content:
              'I drafted a plan and paused here for your approval. Review it, then approve or request changes.',
            metadata: {
              proposedPlan,
              reviewRequired: true,
            },
            role: 'assistant',
          },
          threadId: 'thread-plan-mode-e2e',
          toolCalls: [],
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await mockThreadView(
      authenticatedPage,
      'thread-plan-mode-e2e',
      proposedPlan,
    );

    await authenticatedPage.route(
      '**/threads/thread-plan-mode-e2e/ui-actions',
      async (route: Route) => {
        capturedUiAction = route.request().postDataJSON() as {
          action: string;
          payload?: Record<string, unknown>;
        };

        await route.fulfill({
          body: JSON.stringify({
            creditsRemaining: 116,
            creditsUsed: 2,
            message: {
              content:
                'Executed the approved plan. The toggle, review state, and UI actions are now wired.',
              metadata: {},
              role: 'assistant',
            },
            threadId: 'thread-plan-mode-e2e',
            toolCalls: [],
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await agentPage.goto();
    await agentPage.enablePlanMode();
    await agentPage.sendPrompt('Add plan mode to the agent workspace');
    await expect(authenticatedPage).toHaveURL(/\/chat\/thread-plan-mode-e2e$/);

    await expect(agentPage.planReviewCard).toBeVisible();
    await expect(agentPage.planReviewCard).toContainText(
      'Pause execution after the plan is proposed',
    );

    expect(capturedChatRequest?.planModeEnabled).toBe(true);
    expect(capturedChatRequest?.content).toContain(
      'Add plan mode to the agent workspace',
    );

    await agentPage.approvePlanButton.click();

    await expect(
      authenticatedPage.getByText(
        'Executed the approved plan. The toggle, review state, and UI actions are now wired.',
      ),
    ).toBeVisible();

    expect(capturedUiAction).toEqual({
      action: 'approve_plan',
      payload: {
        planId: 'plan-e2e-1',
      },
    });
  });

  test('requests plan changes and keeps execution paused', async ({
    authenticatedPage,
  }) => {
    const agentPage = new ChatPage(authenticatedPage);
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

    await authenticatedPage.route('**/agent/chat', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          creditsRemaining: 118,
          creditsUsed: 2,
          message: {
            content:
              'I drafted a plan and paused here for your approval. Review it, then approve or request changes.',
            metadata: {
              proposedPlan: initialPlan,
              reviewRequired: true,
            },
            role: 'assistant',
          },
          threadId: 'thread-plan-mode-revise-e2e',
          toolCalls: [],
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await mockThreadView(
      authenticatedPage,
      'thread-plan-mode-revise-e2e',
      initialPlan,
    );

    await authenticatedPage.route(
      '**/threads/thread-plan-mode-revise-e2e/ui-actions',
      async (route: Route) => {
        capturedUiAction = route.request().postDataJSON() as {
          action: string;
          payload?: Record<string, unknown>;
        };

        await route.fulfill({
          body: JSON.stringify({
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
            threadId: 'thread-plan-mode-revise-e2e',
            toolCalls: [],
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await agentPage.goto();
    await agentPage.enablePlanMode();
    await agentPage.sendPrompt('Add plan mode to the agent workspace');
    await expect(authenticatedPage).toHaveURL(
      /\/chat\/thread-plan-mode-revise-e2e$/,
    );

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

    expect(capturedUiAction).toEqual({
      action: 'revise_plan',
      payload: {
        planId: 'plan-e2e-2',
        revisionNote:
          'Show clearer plan status in the conversation and keep execution paused.',
      },
    });
  });
});
