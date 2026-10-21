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
 * Product-page agent chrome is the Agent tab of the right-hand side panel. The
 * panel runs the full window height beside the page; the topbar toggle and
 * ⌘J / Ctrl+J open and close it. `/agent` is the conversation itself, so the
 * panel closes there. Below `xl` the agent is a bottom sheet.
 *
 * @module agent-dock.spec
 */

async function openLibrary(page: Page): Promise<void> {
  await page.goto(brandPath(APP_ROUTES.LIBRARY.IMAGES), {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('topbar-agent-dock-toggle')).toBeVisible();
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
    test(`opens with ${shortcut}, shows the conversation and closes again`, async ({
      authenticatedPage: page,
    }) => {
      await page.setViewportSize({ height: 900, width: 1440 });
      await page.addInitScript(() => window.localStorage.clear());
      await openLibrary(page);

      const dock = page.getByRole('region', { name: 'Agent' });
      const toggle = page.getByTestId('topbar-agent-dock-toggle');
      await expect(dock).toHaveCount(0);
      await expect(toggle).toHaveAccessibleName('Open agent');

      await page.keyboard.press(shortcut);

      await expect(dock).toBeVisible();
      await expect(toggle).toHaveAccessibleName('Close agent');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('tab', { selected: true })).toHaveCount(1);
      // The conversation and its composer render in the panel. (The mocked
      // agent stream is offline in E2E, so the composer is disabled and cannot
      // take focus; the unit tests cover focusing it.)
      await expect(
        dock.getByRole('textbox', { name: 'Conversation prompt' }),
      ).toBeVisible();
      // The panel is its own card: it starts under the full-width topbar,
      // ends one 8px inset above the window bottom, and sits beside the page.
      const canvas = page.getByRole('region', {
        name: 'Primary workspace canvas',
      });
      const [canvasBox, panelBox, topbarBox] = await Promise.all([
        canvas.boundingBox(),
        page.locator('#workspace-context-inspector').boundingBox(),
        page.getByTestId('app-topbar-shell').boundingBox(),
      ]);
      expect(panelBox?.x ?? 0).toBeGreaterThanOrEqual(
        (canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) - 1,
      );
      const topbarBottom = (topbarBox?.y ?? 0) + (topbarBox?.height ?? 0);
      expect(Math.abs((panelBox?.y ?? 0) - topbarBottom)).toBeLessThanOrEqual(
        1,
      );
      expect(
        (topbarBox?.x ?? 0) + (topbarBox?.width ?? 0),
      ).toBeGreaterThanOrEqual((panelBox?.x ?? 0) + (panelBox?.width ?? 0) - 1);
      expect(
        Math.abs((panelBox?.y ?? 0) + (panelBox?.height ?? 0) - (900 - 8)),
      ).toBeLessThanOrEqual(1);

      await page.keyboard.press(shortcut);
      await expect(dock).toHaveCount(0);
      await expect(toggle).toHaveAccessibleName('Open agent');
      await expectNoErrorOverlay(page);
    });
  }

  test('restores the open panel after reload', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openLibrary(page);
    await page.keyboard.press('Meta+j');
    await expect(page.getByRole('region', { name: 'Agent' })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('region', { name: 'Agent' })).toBeVisible();
  });

  test('hands off to the full conversation and closes on /agent', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openLibrary(page);
    await page.getByTestId('topbar-agent-dock-toggle').click();

    const dock = page.getByRole('region', { name: 'Agent' });
    await page.getByTestId('workspace-panel-full-page').click();

    await expect(page).toHaveURL(/\/agent(\/|$)/);
    await expect(dock).toHaveCount(0);
    await expect(page.getByTestId('topbar-agent-dock-toggle')).toBeDisabled();

    await openLibrary(page);
    await expect(dock).toHaveCount(0);
  });

  test('opens as a bottom sheet on mobile', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await openLibrary(page);

    await page.getByTestId('topbar-agent-dock-toggle').click();

    const sheet = page.getByRole('dialog', { name: 'Agent' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close agent' }).click();
    await expect(sheet).toHaveCount(0);
  });
});
