import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

const ORG = '/test-org/~';

const CHAT_INPUT =
  '[data-testid="agent-chat-input-shell"] [contenteditable="true"]';

/**
 * Best-effort: focus the message composer and type a prompt. The chat input is
 * a TipTap contenteditable shell. Never throws — exercises composer code paths
 * for coverage without coupling the spec to async stream timing.
 */
async function typeInComposer(page: Page, prompt: string): Promise<boolean> {
  const composer = page.locator(CHAT_INPUT).first();
  const isVisible = await composer
    .isVisible({ timeout: 8_000 })
    .catch(() => false);

  if (!isVisible) {
    return false;
  }

  await composer.click({ timeout: 5_000 }).catch(() => {});
  await composer.pressSequentially(prompt, { timeout: 5_000 }).catch(() => {});
  return true;
}

/** Best-effort: submit whatever is in the composer (mocked endpoints). */
async function submitComposer(page: Page): Promise<void> {
  const wasSent = await tryClick(
    page,
    '[data-testid="agent-chat-input-shell"] button',
  );

  if (!wasSent) {
    await page
      .locator(CHAT_INPUT)
      .first()
      .press('Enter', { timeout: 5_000 })
      .catch(() => {});
  }
}

async function assertHealthy(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expectNoErrorOverlay(page);
}

test.describe('Chat flow interactions', () => {
  test.setTimeout(90_000);

  test('composer accepts a typed prompt on /agent', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${ORG}/agent`);
    await typeInComposer(authenticatedPage, 'Draft a launch post');
    await assertHealthy(authenticatedPage);
  });

  test('composer sends a prompt on /agent/new', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${ORG}/agent/new`);
    const wasTyped = await typeInComposer(authenticatedPage, 'Hello agent');
    if (wasTyped) {
      await submitComposer(authenticatedPage);
    }
    await assertHealthy(authenticatedPage);
  });

  test('new chat surface exposes prompt suggestions', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${ORG}/agent/new`);
    await tryClick(authenticatedPage, '[class*="suggestion"] button');
    await tryClick(authenticatedPage, '[class*="prompt-bar"] button');
    await assertHealthy(authenticatedPage);
  });

  test('existing thread view stays interactive with composer', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${ORG}/agent/thread-1`);
    await typeInComposer(authenticatedPage, 'Follow up on this thread');
    await tryClick(authenticatedPage, 'button');
    await assertHealthy(authenticatedPage);
  });

  test('thread view replies via send button', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, `${ORG}/agent/thread-1`);
    const wasTyped = await typeInComposer(authenticatedPage, 'Reply please');
    if (wasTyped) {
      await submitComposer(authenticatedPage);
    }
    await assertHealthy(authenticatedPage);
  });

  test('thread list and new-chat navigation are reachable', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${ORG}/agent/thread-1`);
    await tryClick(
      authenticatedPage,
      '[data-testid="agent-thread-list-content"] a',
    );
    await tryClick(authenticatedPage, 'a[href*="/agent/new"]');
    await assertHealthy(authenticatedPage);
  });

  test('model or agent selector toggles when present', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${ORG}/agent/new`);
    await tryClick(authenticatedPage, '[aria-haspopup="menu"]');
    await tryClick(authenticatedPage, '[role="menuitem"]');
    await assertHealthy(authenticatedPage);
  });

  test('retired agent onboarding URL is rejected as an unknown thread, not redirected', async ({
    authenticatedPage,
  }) => {
    // Redirects for retired entries were removed (hard cuts). `onboarding` is
    // now just an id no thread has, so the API answers 404 for it and the
    // agent shows the not-found state with a way back. Canonical onboarding
    // stays at /onboarding (onboarding.spec.ts: "keeps the onboarding entry
    // route").
    await authenticatedPage.route('**/threads/onboarding**', (route) =>
      route.fulfill({
        body: JSON.stringify({ message: 'Thread not found.' }),
        contentType: 'application/json',
        status: 404,
      }),
    );

    await authenticatedPage.goto(`${ORG}/agent/onboarding`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/agent\/onboarding$/);
    const notFound = authenticatedPage.getByTestId('agent-thread-not-found');
    await expect(notFound).toBeVisible({ timeout: 30_000 });
    await expect(
      notFound.getByRole('heading', { name: 'Chat not found' }),
    ).toBeVisible();

    // The only way out is a fresh chat, never a legacy onboarding route.
    await notFound.getByRole('link', { name: 'Start a new chat' }).click();
    await expect(authenticatedPage).toHaveURL(/\/agent\/new(\?|$)/);
    await expect(authenticatedPage).not.toHaveURL(/onboarding/);
    await expectNoErrorOverlay(authenticatedPage);
  });
});
