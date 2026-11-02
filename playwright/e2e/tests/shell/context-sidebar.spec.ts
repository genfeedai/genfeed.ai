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
 * The shell's context sidebar is selection-driven: selecting an asset opens
 * it with the asset's detail, closing it deselects, and nothing selected
 * means no sidebar. The Library tile is the reference registration; Studio's
 * Playground shows a generation in its own output column instead.
 *
 * @module context-sidebar.spec
 */

const TILE_TEST_ID = 'masonry-ingredient-ingredient-image-1';

async function openLibraryImages(page: Page): Promise<void> {
  await mockLibraryData(page);
  await page.goto(brandPath(APP_ROUTES.LIBRARY.IMAGES), {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId(TILE_TEST_ID)).toBeVisible();
}

test.describe('Context sidebar — selection driven', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('shows no right column while nothing is selected, with Context in the topbar', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openLibraryImages(authenticatedPage);

    await expect(
      authenticatedPage.getByRole('complementary', {
        name: 'Side panel',
      }),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('topbar-context-toggle'),
    ).toHaveAttribute('aria-expanded', 'false');
    // The legacy agent inspector and its tabs are gone.
    await expect(
      authenticatedPage.getByRole('complementary', {
        name: 'Workspace inspector',
      }),
    ).toHaveCount(0);
  });

  test('closes details from inside the sidebar and reopens from the asset', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openLibraryImages(authenticatedPage);
    const tile = authenticatedPage.getByTestId(TILE_TEST_ID);
    await tile.click();
    const contextSidebar = authenticatedPage.getByRole('complementary', {
      name: 'Side panel',
    });
    await expect(contextSidebar.getByLabel('Asset details')).toBeVisible();
    const contextToggle = authenticatedPage.getByTestId(
      'topbar-context-toggle',
    );
    await expect(contextToggle).toHaveAttribute('aria-expanded', 'true');
    await contextSidebar.getByTestId('workspace-panel-close').click();
    await expect(
      authenticatedPage.locator('#workspace-context-inspector'),
    ).toHaveAttribute('inert', '');
    await expect(contextToggle).toHaveAttribute('aria-expanded', 'false');
    await tile.click();
    await expect(contextSidebar.getByLabel('Asset details')).toBeVisible();
  });

  test('switches Chat, Context and History from the topbar toggles', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openLibraryImages(authenticatedPage);
    await authenticatedPage.getByTestId(TILE_TEST_ID).click();

    const contextSidebar = authenticatedPage.getByRole('complementary', {
      name: 'Side panel',
    });
    const title = contextSidebar.getByTestId('workspace-panel-title');
    const chatToggle = authenticatedPage.getByTestId(
      'topbar-agent-dock-toggle',
    );
    const contextToggle = authenticatedPage.getByTestId(
      'topbar-context-toggle',
    );
    await expect(title).toHaveText('Context');
    await expect(contextToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(chatToggle).toHaveAttribute('aria-expanded', 'false');

    await chatToggle.click();
    await expect(title).toHaveText('Chat');
    await expect(chatToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(contextToggle).toHaveAttribute('aria-expanded', 'false');

    // History is part of Chat: it opens from the Chat header and keeps the
    // Chat toggle pressed.
    await contextSidebar.getByTestId('workspace-panel-history').click();
    await expect(title).toHaveText('History');
    await expect(chatToggle).toHaveAttribute('aria-expanded', 'true');
    await contextSidebar.getByTestId('workspace-panel-back').click();
    await expect(title).toHaveText('Chat');

    await contextToggle.click();
    await expect(title).toHaveText('Context');
    await contextToggle.click();
    await expect(contextSidebar).toHaveCount(0);
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opens the shared mobile Context panel on a tap and closes it when dismissed', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 844, width: 390 });
    await openLibraryImages(authenticatedPage);

    await authenticatedPage.getByTestId(TILE_TEST_ID).click();

    const drawer = authenticatedPage.getByRole('dialog', { name: 'Agent' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('workspace-panel-header')).toHaveCount(1);
    await expect(drawer.getByTestId('workspace-panel-title')).toHaveText(
      'Context',
    );
    await expect(drawer.getByLabel('Asset details')).toBeVisible();

    await authenticatedPage.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });

  test('opens Library asset details from the tile and keeps bulk selection independent of close', async ({
    authenticatedPage,
  }) => {
    await mockLibraryData(authenticatedPage);
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.IMAGES), {
      waitUntil: 'domcontentloaded',
    });

    const selectToggle = authenticatedPage.getByTestId(
      'masonry-select-ingredient-image-1',
    );
    const tile = authenticatedPage.getByTestId(
      'masonry-ingredient-ingredient-image-1',
    );
    const contextSidebar = authenticatedPage.getByRole('complementary', {
      name: 'Side panel',
    });
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(contextSidebar).toHaveCount(0);

    // The select control stays opacity-0 on a hover-capable pointer until the
    // tile group is hovered. Playwright refuses to hover a hidden target, so
    // reveal it from the tile the way a pointer does.
    await tile.hover();
    await expect(selectToggle).toBeVisible();
    await selectToggle.click();
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(contextSidebar).toHaveCount(0);

    await tile.click();
    await expect(contextSidebar).toBeVisible();
    await expect(contextSidebar.getByLabel('Asset details')).toBeVisible();
    await expect(
      contextSidebar.getByTestId('context-sidebar-title'),
    ).toHaveText('Product Photo');
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'true');

    await contextSidebar.getByTestId('workspace-panel-close').click();

    await expect(contextSidebar).toHaveCount(0);
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'true');

    await selectToggle.click();
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(contextSidebar).toHaveCount(0);
  });
});
