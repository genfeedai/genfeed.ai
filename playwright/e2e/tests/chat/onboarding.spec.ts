import { orgPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/constants';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

function buildJsonApiCollection(
  items: Array<Record<string, unknown>>,
  type = 'thread',
) {
  return {
    data: items.map((item) => ({
      attributes: item,
      id: String(item.id),
      type,
    })),
  };
}

function buildJsonApiResource(item: Record<string, unknown>, type = 'thread') {
  return {
    data: {
      attributes: item,
      id: String(item.id),
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

async function mockThreadBundle(
  page: Page,
  thread: {
    brandId?: string;
    contextVersion?: number;
    id: string;
    messageContent?: string;
    messageMetadata?: Record<string, unknown>;
    snapshot?: {
      activeRun: { runId: string; status: string } | null;
      lastSequence: number;
      timeline: Array<Record<string, unknown>>;
    };
    title: string;
  },
): Promise<void> {
  const threadResource = {
    brandId: thread.brandId ?? null,
    contextVersion: thread.contextVersion ?? 1,
    createdAt: '2026-03-10T10:00:00.000Z',
    id: thread.id,
    status: 'active',
    title: thread.title,
    updatedAt: '2026-03-10T10:05:00.000Z',
  };

  await page.route(`**/threads/${thread.id}/messages?*`, async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        buildJsonApiCollection(
          thread.messageContent
            ? [
                {
                  content: thread.messageContent,
                  createdAt: '2026-03-10T10:05:00.000Z',
                  id: `msg-${thread.id}`,
                  metadata: thread.messageMetadata,
                  role: 'assistant',
                  threadId: thread.id,
                },
              ]
            : [],
          'message',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(`**/threads/${thread.id}/snapshot`, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeRun: thread.snapshot?.activeRun ?? null,
        lastAssistantMessage: null,
        lastSequence: thread.snapshot?.lastSequence ?? 0,
        latestProposedPlan: null,
        latestUiBlocks: null,
        memorySummaryRefs: [],
        pendingApprovals: [],
        pendingInputRequests: [],
        profileSnapshot: null,
        sessionBinding: null,
        source: 'onboarding',
        threadId: thread.id,
        threadStatus: 'active',
        timeline: thread.snapshot?.timeline ?? [],
        title: thread.title,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(`**/threads/${thread.id}`, async (route) => {
    await route.fulfill({
      body: JSON.stringify(buildJsonApiResource(threadResource)),
      contentType: 'application/json',
      status: 200,
    });
  });
}

async function mockThreads(
  page: Page,
  threads: Array<{
    brandId?: string;
    contextVersion?: number;
    id: string;
    messageContent?: string;
    messageMetadata?: Record<string, unknown>;
    snapshot?: {
      activeRun: { runId: string; status: string } | null;
      lastSequence: number;
      timeline: Array<Record<string, unknown>>;
    };
    title: string;
  }>,
): Promise<void> {
  await page.route(/\/threads(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        buildJsonApiCollection(
          threads.map((thread) => ({
            brandId: thread.brandId ?? null,
            contextVersion: thread.contextVersion ?? 1,
            createdAt: '2026-03-10T10:00:00.000Z',
            id: thread.id,
            status: 'active',
            title: thread.title,
            updatedAt: '2026-03-10T10:05:00.000Z',
          })),
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await Promise.all(threads.map((thread) => mockThreadBundle(page, thread)));
}

test.describe('Agent Onboarding', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockAgentCredits(authenticatedPage);
    await mockActiveRuns(authenticatedPage);
  });

  test('renders the onboarding chat shell without the shared sidebar chrome', async ({
    authenticatedPage,
  }) => {
    await mockThreads(authenticatedPage, []);

    await authenticatedPage.goto(APP_ROUTES.AGENT.ONBOARDING);
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect
      .poll(() => new URL(authenticatedPage.url()).pathname)
      .toBe(APP_ROUTES.AGENT.ONBOARDING);
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  for (let pass = 1; pass <= 5; pass += 1) {
    test(`bootstraps onboarding chat, promotes the thread route, and saves the drafted brand voice profile (pass ${pass}/5)`, async ({
      authenticatedPage,
    }) => {
      const threadId = 'thread-onboarding-voice-e2e';
      let uiActionRequest:
        | {
            action: string;
            payload?: Record<string, unknown>;
          }
        | undefined;

      await mockThreads(authenticatedPage, [
        {
          brandId: 'brand-voice-1',
          contextVersion: 1,
          id: threadId,
          messageContent: 'I drafted a voice profile for your approval.',
          messageMetadata: {
            toolCalls: [
              {
                creditsUsed: 0,
                durationMs: 220,
                status: 'completed',
                toolName: 'draft_brand_voice_profile',
              },
            ],
            uiActions: [
              {
                brandId: 'brand-voice-1',
                ctas: [
                  {
                    action: 'confirm_save_brand_voice_profile',
                    label: 'Approve and save',
                    payload: {
                      brandId: 'brand-voice-1',
                      sourceActionId: 'brand-voice-card-e2e',
                      voiceProfile: {
                        audience: ['startup operators'],
                        doNotSoundLike: ['corporate jargon'],
                        messagingPillars: ['clarity', 'proof'],
                        sampleOutput:
                          'Clear systems create compounding output.',
                        style: 'direct',
                        tone: 'confident',
                        values: ['clarity'],
                      },
                    },
                  },
                ],
                data: {
                  brandId: 'brand-voice-1',
                  voiceProfile: {
                    audience: ['startup operators'],
                    doNotSoundLike: ['corporate jargon'],
                    messagingPillars: ['clarity', 'proof'],
                    sampleOutput: 'Clear systems create compounding output.',
                    style: 'direct',
                    tone: 'confident',
                    values: ['clarity'],
                  },
                },
                description: 'Review the brand voice and save it if it fits.',
                id: 'brand-voice-card-e2e',
                title: 'Brand Voice Draft',
                type: 'brand_voice_profile_card',
              },
            ],
          },
          title: 'Brand voice onboarding',
        },
      ]);

      await authenticatedPage.route(
        '**/agent/threads/turns/stream',
        async (route) => {
          await route.fulfill({
            body: JSON.stringify({
              channel: 'socket',
              runId: 'run-onboarding-voice-e2e',
              threadId,
            }),
            contentType: 'application/json',
            status: 202,
          });
        },
      );

      await authenticatedPage.route(
        `**/threads/${threadId}/ui-actions`,
        async (route) => {
          uiActionRequest = route.request().postDataJSON() as {
            action: string;
            payload?: Record<string, unknown>;
          };

          await route.fulfill({
            body: JSON.stringify({
              brandId: 'brand-voice-1',
              contextVersion: 1,
              creditsRemaining: 118,
              creditsUsed: 0,
              message: {
                content: 'Brand voice saved to the selected brand.',
                metadata: {
                  uiActions: [],
                },
                role: 'assistant',
              },
              threadId,
              toolCalls: [
                {
                  creditsUsed: 0,
                  durationMs: 180,
                  status: 'completed',
                  toolName: 'save_brand_voice_profile',
                },
              ],
            }),
            contentType: 'application/json',
            status: 200,
          });
        },
      );

      const onboardingPath = orgPath(APP_ROUTES.AGENT.ONBOARDING);
      const threadPath = `${onboardingPath}/${threadId}`;

      await authenticatedPage.goto(onboardingPath);
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await expect
        .poll(() => new URL(authenticatedPage.url()).pathname)
        .toBe(onboardingPath);
      const composer = authenticatedPage
        .locator(
          '[data-testid="agent-chat-input-shell"] [contenteditable="true"]',
        )
        .first();
      await composer.click();
      await composer.pressSequentially(
        'We help startup operators build AI workflows without noisy guru language.',
      );
      await composer.press('Enter');

      await expect
        .poll(() => new URL(authenticatedPage.url()).pathname)
        .toBe(threadPath);

      // Prove the promoted thread route is durable, then interact with the
      // server-hydrated card. The route transition and the initial local turn
      // deliberately overlap; reloading removes that transient hand-off from
      // the action assertion while covering the user-critical resume path.
      await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
      expect(new URL(authenticatedPage.url()).pathname).toBe(threadPath);
      await expect(
        authenticatedPage.getByText(
          'I drafted a voice profile for your approval.',
        ),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Brand Voice Draft' }),
      ).toBeVisible();
      await expect(authenticatedPage.getByText('clarity, proof')).toBeVisible();
      await expect(
        authenticatedPage.getByText('Clear systems create compounding output.'),
      ).toBeVisible();

      await authenticatedPage
        .getByRole('button', { name: 'Approve and save' })
        .click();

      await expect(
        authenticatedPage.getByText('Brand voice saved to this brand.'),
      ).toBeVisible();

      expect(uiActionRequest).toEqual({
        action: 'confirm_save_brand_voice_profile',
        brandId: 'brand-voice-1',
        expectedContextVersion: 1,
        payload: {
          brandId: 'brand-voice-1',
          sourceActionId: 'brand-voice-card-e2e',
          voiceProfile: {
            audience: ['startup operators'],
            doNotSoundLike: ['corporate jargon'],
            messagingPillars: ['clarity', 'proof'],
            sampleOutput: 'Clear systems create compounding output.',
            style: 'direct',
            tone: 'confident',
            values: ['clarity'],
          },
        },
      });
    });
  }

  test('restores a terminal failure after reload without offering an unsafe retry', async ({
    authenticatedPage,
  }) => {
    const threadId = 'thread-terminal-failure-e2e';
    await mockThreads(authenticatedPage, [
      {
        id: threadId,
        messageContent: 'I could not complete that request.',
        snapshot: {
          activeRun: { runId: 'run-terminal-failure-e2e', status: 'failed' },
          lastSequence: 1,
          timeline: [
            {
              createdAt: '2026-08-28T17:01:00.000Z',
              detail: 'Provider authentication failed',
              id: 'failure-terminal-e2e',
              kind: 'error',
              label: 'Agent error',
              runId: 'run-terminal-failure-e2e',
              sequence: 1,
              status: 'failed',
            },
          ],
        },
        title: 'Terminal failure',
      },
    ]);

    const threadPath = `${orgPath(APP_ROUTES.AGENT.ROOT)}/${threadId}`;
    await authenticatedPage.goto(threadPath);
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });

    await expect(
      authenticatedPage.getByText('Provider authentication failed').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { exact: true, name: 'Retry' }),
    ).toHaveCount(0);
  });
});
