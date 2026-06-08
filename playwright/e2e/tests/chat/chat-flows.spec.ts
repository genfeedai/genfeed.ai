import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { ChatPage } from '../../pages/chat.page';

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

function buildChatResponse(options: {
  content: string;
  creditsRemaining?: number;
  toolCalls?: Array<{
    creditsUsed: number;
    durationMs: number;
    error?: string;
    status: 'completed' | 'failed';
    toolName: string;
  }>;
  uiActions?: Array<Record<string, unknown>>;
}): string {
  return JSON.stringify({
    creditsRemaining: options.creditsRemaining ?? 118,
    creditsUsed: 2,
    message: {
      content: options.content,
      metadata: {
        uiActions: options.uiActions ?? [],
      },
      role: 'assistant',
    },
    threadId: 'thread-agent-e2e',
    toolCalls: options.toolCalls ?? [],
  });
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
              threadId,
            },
            {
              content: options.assistantContent,
              createdAt: now,
              metadata: {
                uiActions: options.uiActions ?? [],
              },
              role: 'assistant',
              threadId,
            },
          ],
          'messages',
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

test.describe('Agent Chat', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockAgentCredits(authenticatedPage);
    await mockActiveRuns(authenticatedPage);
  });

  test('publishes from chat and renders follow-up CTAs', async ({
    authenticatedPage,
  }) => {
    const agentPage = new ChatPage(authenticatedPage);
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

    await authenticatedPage.route('**/agent/chat', async (route) => {
      await route.fulfill({
        body: buildChatResponse({
          content: assistantContent,
          toolCalls: [
            {
              creditsUsed: 0,
              durationMs: 180,
              status: 'completed',
              toolName: 'create_post',
            },
          ],
          uiActions: publishUiActions,
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await mockThreadReplay(authenticatedPage, {
      assistantContent,
      title: 'Publish selected content',
      uiActions: publishUiActions,
      userContent: 'publish this',
    });

    await authenticatedPage.route(
      '**/threads/thread-agent-e2e/ui-actions',
      async (route: Route) => {
        uiActionRequest = route.request().postDataJSON() as {
          action: string;
          payload?: Record<string, unknown>;
        };

        await route.fulfill({
          body: JSON.stringify({
            creditsRemaining: 118,
            creditsUsed: 0,
            message: {
              content: 'Publish confirmed. Your post is ready to review.',
              metadata: {
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
            },
            threadId: 'thread-agent-e2e',
            toolCalls: [
              {
                creditsUsed: 0,
                durationMs: 240,
                status: 'completed',
                toolName: 'create_post',
              },
            ],
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await agentPage.goto();
    await agentPage.sendPrompt('publish this');

    await expect(
      authenticatedPage.getByText('Ready to publish this post from chat.'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Publish selected content',
      }),
    ).toBeVisible();

    await agentPage.platformButton('linkedin').click();
    await expect(agentPage.confirmPublishButton()).toBeDisabled();

    await agentPage.platformButton('twitter').click();
    await agentPage.publishCaption.fill('Updated launch caption');
    await agentPage.publishSchedule.fill('2026-03-12T09:30');

    await expect(
      authenticatedPage.getByRole('button', { name: 'Confirm schedule' }),
    ).toBeEnabled();
    await authenticatedPage
      .getByRole('button', { name: 'Confirm schedule' })
      .click();

    await expect(
      authenticatedPage.getByText('Publish scheduled from chat.'),
    ).toBeVisible();
    expect(uiActionRequest).toEqual({
      action: 'confirm_publish_post',
      payload: {
        caption: 'Updated launch caption',
        contentId: 'ingredient-42',
        platforms: ['twitter'],
        scheduledAt: '2026-03-12T09:30',
        sourceActionId: 'publish-card-e2e',
      },
    });
  });

  test('renders normalized analytics snapshot metrics for a published post', async ({
    authenticatedPage,
  }) => {
    const agentPage = new ChatPage(authenticatedPage);
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

    await authenticatedPage.route('**/agent/chat', async (route) => {
      await route.fulfill({
        body: buildChatResponse({
          content: assistantContent,
          toolCalls: [
            {
              creditsUsed: 0,
              durationMs: 165,
              status: 'completed',
              toolName: 'get_analytics',
            },
          ],
          uiActions: analyticsUiActions,
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await mockThreadReplay(authenticatedPage, {
      assistantContent,
      title: 'Post analytics snapshot',
      uiActions: analyticsUiActions,
      userContent: 'show analytics',
    });

    await agentPage.goto();
    await agentPage.sendPrompt('show analytics');

    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Post analytics snapshot',
      }),
    ).toBeVisible();
    await expect(authenticatedPage.getByText('12.4K')).toBeVisible();
    await expect(authenticatedPage.getByText('8.2%').first()).toBeVisible();
    await expect(authenticatedPage.getByText('380')).toBeVisible();
    await expect(authenticatedPage.getByText('24')).toBeVisible();
  });

  test('shows publish fallback when selected content has no post analytics yet', async ({
    authenticatedPage,
  }) => {
    const agentPage = new ChatPage(authenticatedPage);
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

    await authenticatedPage.route('**/agent/chat', async (route) => {
      await route.fulfill({
        body: buildChatResponse({
          content: assistantContent,
          toolCalls: [
            {
              creditsUsed: 0,
              durationMs: 140,
              status: 'completed',
              toolName: 'get_analytics',
            },
          ],
          uiActions: fallbackUiActions,
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await mockThreadReplay(authenticatedPage, {
      assistantContent,
      title: 'Publish selected content',
      uiActions: fallbackUiActions,
      userContent: 'show analytics',
    });

    await agentPage.goto();
    await agentPage.sendPrompt('show analytics');

    await expect(
      authenticatedPage.getByText(
        'No post analytics yet for this ingredient. Publish it first.',
      ),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Publish selected content',
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(
        'Publish this content to start collecting metrics.',
      ),
    ).toBeVisible();
  });
});
