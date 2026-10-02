import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

/**
 * Product-page agent chrome is a chat bubble, with page shortcuts fanned
 * beside it, that expands into a floating overlay. ⌘J / Ctrl+J still toggles
 * it. `/agent` is the conversation itself, so the overlay closes there. The
 * split dock remains in the tree behind a hidden-chrome flag.
 *
 * @module agent-dock.spec
 */

async function openLibrary(page: Page): Promise<void> {
  await page.goto(brandPath(APP_ROUTES.LIBRARY.IMAGES), {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('agent-conversation-bubble')).toBeVisible();
}

test.describe('Agent dock', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockLibraryData(authenticatedPage);
  });

  for (const shortcut of ['Meta+j', 'Control+j']) {
    test(`opens with ${shortcut}, shows the conversation and closes with Esc`, async ({
      authenticatedPage: page,
    }) => {
      await page.setViewportSize({ height: 900, width: 1440 });
      await openLibrary(page);

      const dock = page.getByRole('region', { name: 'Agent' });
      await expect(page.getByTestId('topbar-agent-dock-toggle')).toHaveCount(0);
      await expect(dock).toHaveCount(0);

      await page.keyboard.press(shortcut);

      await expect(dock).toBeVisible();
      const bubble = page.getByTestId('agent-conversation-bubble');
      await expect(bubble).toHaveAttribute('tabindex', '-1');
      await expect(
        bubble.locator('xpath=ancestor::*[@inert][1]'),
      ).toHaveAttribute('aria-hidden', 'true');
      // The conversation and its composer render in the overlay. (The mocked
      // agent stream is offline in E2E, so the composer is disabled and cannot
      // take focus; the unit tests cover focusing it.)
      await expect(
        dock.getByRole('textbox', { name: 'Conversation prompt' }),
      ).toBeVisible();
      const canvas = page.getByRole('region', {
        name: 'Primary workspace canvas',
      });
      const [canvasBox, dockBox] = await Promise.all([
        canvas.boundingBox(),
        dock.boundingBox(),
      ]);
      expect(dockBox?.y ?? 0).toBeGreaterThan(canvasBox?.y ?? 0);

      await dock.getByRole('button', { name: 'Open full page' }).focus();
      await page.keyboard.press('Escape');
      await expect(dock).toHaveCount(0);
      await expect(page.getByTestId('agent-conversation-bubble')).toBeVisible();

      await page.getByTestId('agent-conversation-bubble').click();
      await expect(dock).toBeVisible();
      await page.keyboard.press(shortcut);
      await expect(dock).toHaveCount(0);
      await expectNoErrorOverlay(page);
    });
  }

  test('starts closed after reload so the compact bar is the entry', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openLibrary(page);
    await page.keyboard.press('Meta+j');
    await expect(page.getByRole('region', { name: 'Agent' })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('agent-conversation-bubble')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Agent' })).toHaveCount(0);
  });

  test('hands off to the full conversation and closes on /agent', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openLibrary(page);
    await page.getByTestId('agent-conversation-bubble').click();

    const dock = page.getByRole('region', { name: 'Agent' });
    await dock.getByRole('button', { name: 'Open full page' }).click();

    await expect(page).toHaveURL(/\/agent(\/|$)/);
    await expect(dock).toHaveCount(0);
    await expect(page.getByTestId('topbar-agent-dock-toggle')).toHaveCount(0);
    await expect(page.getByTestId('agent-conversation-bubble')).toHaveCount(0);

    await openLibrary(page);
    await expect(dock).toHaveCount(0);
    await expect(page.getByTestId('agent-conversation-bubble')).toBeVisible();
  });

  test('opens as a bottom sheet on mobile', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await openLibrary(page);

    await page.getByTestId('agent-conversation-bubble').click();

    const sheet = page.getByRole('dialog', { name: 'Agent' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close agent' }).click();
    await expect(sheet).toHaveCount(0);
  });
});
