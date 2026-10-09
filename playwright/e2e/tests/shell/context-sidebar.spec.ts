import { brandPath } from '@e2e/utils/app-chrome';
import { IngredientCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import {
  mockActiveSubscription,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

/**
 * The shell's context sidebar is selection-driven: selecting an asset opens
 * it with the asset's detail, closing it deselects, and nothing selected
 * means no sidebar. Studio's asset panel is the reference registration.
 *
 * @module context-sidebar.spec
 */

const ASSET_ID = 'studio-asset-e2e-1';
const ASSET_PROMPT = 'Sunlit studio portrait for the spring launch';

async function mockStudioGallery(page: Page): Promise<void> {
  const fulfill = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const { pathname } = new URL(route.request().url());
    // Used in / History relations for the selected asset.
    if (/\/ingredients\/[^/]+\/(posts|children)$/.test(pathname)) {
      await route.fulfill({
        body: JSON.stringify({ data: [] }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            attributes: {
              category: IngredientCategory.IMAGE,
              cdnUrl: 'https://cdn.genfeed.ai/mock/studio-portrait.jpg',
              createdAt: '2026-09-20T10:00:00.000Z',
              height: 1024,
              metadata: { model: 'flux-dev' },
              prompt: ASSET_PROMPT,
              status: 'GENERATED',
              width: 1024,
            },
            id: ASSET_ID,
            type: 'ingredients',
          },
        ],
        meta: { page: 1, pageSize: 50, totalCount: 1 },
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/api.genfeed.ai/v1/ingredients**', fulfill);
  await page.route('**/v1/ingredients**', fulfill);
}

async function openStudioList(page: Page): Promise<void> {
  await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
    waitUntil: 'domcontentloaded',
  });
  // List rows expose the prompt as plain text, a stable non-control target.
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByText(ASSET_PROMPT)).toBeVisible();
}

test.describe('Context sidebar — selection driven', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockStudioGallery(authenticatedPage);
  });

  test('shows no right column and no details toggle while nothing is selected', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openStudioList(authenticatedPage);

    await expect(
      authenticatedPage.getByRole('complementary', {
        name: 'Selection details',
      }),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('topbar-inspector-toggle'),
    ).toHaveCount(0);
    // The legacy agent inspector and its tabs are gone.
    await expect(
      authenticatedPage.getByRole('complementary', {
        name: 'Workspace inspector',
      }),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByRole('tab', { exact: true, name: 'Chat' }),
    ).toHaveCount(0);
  });

  test('opens on asset selection and closes on deselect', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openStudioList(authenticatedPage);

    const contextSidebar = authenticatedPage.getByRole('complementary', {
      name: 'Selection details',
    });
    await expect(contextSidebar).toHaveCount(0);

    const card = authenticatedPage.getByTestId(`studio-asset-${ASSET_ID}`);
    await card.getByText(ASSET_PROMPT).click();

    await expect(contextSidebar).toBeVisible();
    await expect(card).toHaveAttribute('data-selected', 'true');
    await expect(
      contextSidebar.getByTestId('context-sidebar-title'),
    ).toHaveText('Image');
    const panel = contextSidebar.getByTestId('studio-playground-inspector');
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole('tablist', { name: 'Generation details' }),
    ).toBeVisible();
    await expect(
      panel
        .getByRole('group', { name: 'Asset actions' })
        .getByRole('button', { name: 'Ask Agent about this' }),
    ).toBeVisible();
    // Only one right column: Studio no longer paints its own aside.
    await expect(
      authenticatedPage.getByTestId('studio-playground-inspector'),
    ).toHaveCount(1);

    await contextSidebar
      .getByRole('button', { exact: true, name: 'Close details' })
      .click();

    await expect(contextSidebar).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('studio-playground-inspector'),
    ).toHaveCount(0);
    await expect(card).toHaveAttribute('data-selected', 'false');
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('hands the selected asset to the agent dock without leaving Studio', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openStudioList(authenticatedPage);
    const studioUrl = authenticatedPage.url();

    await authenticatedPage
      .getByTestId(`studio-asset-${ASSET_ID}`)
      .getByText(ASSET_PROMPT)
      .click();
    await authenticatedPage
      .getByRole('group', { name: 'Asset actions' })
      .getByRole('button', { name: 'Ask Agent about this' })
      .click();

    const dock = authenticatedPage.getByRole('region', { name: 'Agent' });
    await expect(dock).toBeVisible();
    await expect(
      dock.getByLabel(`Referenced content: ${ASSET_PROMPT}`),
    ).toBeVisible();
    expect(authenticatedPage.url()).toBe(studioUrl);
  });

  test('closes details from inside the sidebar and reopens from the asset', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openStudioList(authenticatedPage);
    const card = authenticatedPage.getByTestId(`studio-asset-${ASSET_ID}`);
    await card.getByText(ASSET_PROMPT).click();
    const contextSidebar = authenticatedPage.getByRole('complementary', {
      name: 'Selection details',
    });
    await expect(
      contextSidebar.getByTestId('studio-playground-inspector'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('topbar-inspector-toggle'),
    ).toHaveCount(0);
    await contextSidebar.getByTestId('context-sidebar-close').click();
    await expect(card).toHaveAttribute('data-selected', 'false');
    await expect(
      authenticatedPage.locator('#workspace-context-inspector'),
    ).toHaveAttribute('inert', '');
    await expect(
      authenticatedPage.getByTestId('topbar-inspector-toggle'),
    ).toHaveCount(0);
    await card.getByText(ASSET_PROMPT).click();
    await expect(
      contextSidebar.getByTestId('studio-playground-inspector'),
    ).toBeVisible();
  });

  test('opens the mobile drawer on a tap and deselects when dismissed', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 844, width: 390 });
    await openStudioList(authenticatedPage);

    const card = authenticatedPage.getByTestId(`studio-asset-${ASSET_ID}`);
    await card.getByText(ASSET_PROMPT).click();

    const drawer = authenticatedPage.getByRole('dialog', { name: 'Image' });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByTestId('studio-playground-inspector'),
    ).toBeVisible();

    await authenticatedPage.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(card).toHaveAttribute('data-selected', 'false');
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
      name: 'Selection details',
    });
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(contextSidebar).toHaveCount(0);

    await selectToggle.hover();
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

    await contextSidebar
      .getByRole('button', { exact: true, name: 'Close details' })
      .click();

    await expect(contextSidebar).toHaveCount(0);
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'true');

    await selectToggle.click();
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(contextSidebar).toHaveCount(0);
  });
});
