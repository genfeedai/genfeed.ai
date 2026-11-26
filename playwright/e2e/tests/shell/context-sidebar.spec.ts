import { brandPath } from '@e2e/utils/app-chrome';
import { IngredientCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import {
  mockActiveSubscription,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { showOutputPane } from '../../utils/agent-output-layout';
import { expectNoErrorOverlay } from '../../utils/route-assertions';
import { viewMenuTrigger } from '../../utils/view-menu';

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
              brandId: 'brand-1',
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

/** The Playground's results pane: the page output beside the prompt. */
function resultsPane(page: Page) {
  return page.getByTestId('agent-output-output-pane');
}

/** The Context view, which opens in the results pane instead of a right rail. */
function contextView(page: Page) {
  return resultsPane(page).getByRole('tabpanel', {
    exact: true,
    name: 'Context',
  });
}

/**
 * Sets the Context view open or closed from the topbar icon. A click that
 * lands before hydration is dropped, so retry until the view is in the wanted
 * state, and read the state first each time so a retry never undoes a click
 * that did land.
 */
async function setContextOpen(page: Page, isOpen: boolean): Promise<void> {
  const context = contextView(page);
  await expect(async () => {
    if ((await context.isVisible()) !== isOpen)
      await page.getByTestId('topbar-context-toggle').click();
    if (isOpen) await expect(context).toBeVisible({ timeout: 2_000 });
    else await expect(context).toBeHidden({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

async function openStudioList(page: Page): Promise<void> {
  await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
    waitUntil: 'domcontentloaded',
  });
  // Below `xl` one pane shows at a time, and the prompt comes first.
  const results = await showOutputPane(page);
  // List rows expose the prompt as plain text, a stable non-control target.
  // The gallery's View menu is the one inside the results pane. Below `xl` the
  // pane header also carries the Agent / Output switch, which is named
  // `View: Output` too, so name the gallery's layout, not any `View: ` button.
  await viewMenuTrigger(results, 'Grid').click();
  await page.getByRole('menuitemradio', { exact: true, name: 'List' }).click();
  await expect(viewMenuTrigger(results, 'List')).toBeVisible();
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

  test('shows no right column while nothing is selected, with Context in the topbar', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openStudioList(authenticatedPage);

    // The prompt is on the left and the results on the right: no third column.
    await expect(
      authenticatedPage.getByRole('complementary', {
        name: 'Side panel',
      }),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('agent-output-agent-pane'),
    ).toBeVisible();
    await expect(contextView(authenticatedPage)).toBeHidden();
    await expect(
      authenticatedPage.getByTestId('topbar-context-toggle'),
    ).toHaveAttribute('aria-expanded', 'false');
    // One agent: the Playground has no product dock beside its own prompt.
    await expect(
      authenticatedPage.getByTestId('topbar-agent-dock-toggle'),
    ).toHaveCount(0);
    // The legacy agent inspector and its tabs are gone.
    await expect(
      authenticatedPage.getByRole('complementary', {
        name: 'Workspace inspector',
      }),
    ).toHaveCount(0);
  });

  test('opens on asset selection and closes on deselect', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openStudioList(authenticatedPage);

    const context = contextView(authenticatedPage);
    await expect(context).toBeHidden();

    const card = authenticatedPage.getByTestId(`studio-asset-${ASSET_ID}`);
    await card.getByText(ASSET_PROMPT).click();

    await expect(context).toBeVisible();
    await expect(card).toHaveAttribute('data-selected', 'true');
    await expect(context.getByTestId('context-sidebar-title')).toHaveText(
      'Image',
    );
    const panel = context.getByTestId('studio-playground-inspector');
    await expect(panel).toBeVisible();
    await expect(
      context.getByRole('button', { name: 'View: Recipe' }),
    ).toBeVisible();
    await expect(
      panel
        .getByRole('group', { name: 'Asset actions' })
        .getByRole('button', { name: 'Ask Agent about this' }),
    ).toBeVisible();
    // Only one detail view: it replaces the results, there is no side rail.
    await expect(
      authenticatedPage.getByRole('complementary', { name: 'Side panel' }),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('studio-playground-inspector'),
    ).toHaveCount(1);

    // The panel has no header or close control of its own: the topbar's
    // Context toggle (the panel icon) closes it.
    await expect(context.getByTestId('workspace-panel-header')).toHaveCount(0);
    await expect(context.getByTestId('workspace-panel-close')).toHaveCount(0);
    await setContextOpen(authenticatedPage, false);
    await expect(
      authenticatedPage.getByTestId('studio-playground-inspector'),
    ).toHaveCount(0);
    await expect(card).toHaveAttribute('data-selected', 'false');
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('hands the selected asset to a new conversation', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openStudioList(authenticatedPage);

    await authenticatedPage
      .getByTestId(`studio-asset-${ASSET_ID}`)
      .getByText(ASSET_PROMPT)
      .click();
    await authenticatedPage
      .getByRole('group', { name: 'Asset actions' })
      .getByRole('button', { name: 'Ask Agent about this' })
      .click();

    // The Playground has no dock, so the asset travels with the operator to
    // a new conversation, where it is attached to the draft.
    await authenticatedPage.waitForURL(/\/agent\/new/);
    await expect(
      authenticatedPage.getByLabel(`Referenced content: ${ASSET_PROMPT}`),
    ).toBeVisible();
  });

  test('closes details with the topbar icon and reopens from the asset', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openStudioList(authenticatedPage);
    const card = authenticatedPage.getByTestId(`studio-asset-${ASSET_ID}`);
    await card.getByText(ASSET_PROMPT).click();
    const context = contextView(authenticatedPage);
    await expect(
      context.getByTestId('studio-playground-inspector'),
    ).toBeVisible();
    const contextToggle = authenticatedPage.getByTestId(
      'topbar-context-toggle',
    );
    await expect(contextToggle).toHaveAttribute('aria-expanded', 'true');
    await setContextOpen(authenticatedPage, false);
    await expect(card).toHaveAttribute('data-selected', 'false');
    await expect(contextToggle).toHaveAttribute('aria-expanded', 'false');
    await card.getByText(ASSET_PROMPT).click();
    await expect(
      context.getByTestId('studio-playground-inspector'),
    ).toBeVisible();
  });

  test('swaps the results pane and Context from the topbar icon, with the prompt staying put', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await openStudioList(authenticatedPage);
    const prompt = authenticatedPage.getByTestId('studio-playground-prompt');
    await expect(prompt).toBeVisible();

    await authenticatedPage
      .getByTestId(`studio-asset-${ASSET_ID}`)
      .getByText(ASSET_PROMPT)
      .click();

    const context = contextView(authenticatedPage);
    const results = resultsPane(authenticatedPage).getByRole('tabpanel', {
      exact: true,
      name: 'Results',
    });
    const contextToggle = authenticatedPage.getByTestId(
      'topbar-context-toggle',
    );
    await expect(context.getByTestId('workspace-agent-context')).toBeVisible();
    await expect(results).toBeHidden();
    await expect(contextToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(prompt).toBeVisible();

    await setContextOpen(authenticatedPage, false);
    await expect(results).toBeVisible();
    await expect(prompt).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opens Context in the results pane on a tap and deselects when closed', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 844, width: 390 });
    await openStudioList(authenticatedPage);

    const card = authenticatedPage.getByTestId(`studio-asset-${ASSET_ID}`);
    await card.getByText(ASSET_PROMPT).click();

    const context = contextView(authenticatedPage);
    await expect(context).toBeVisible();
    await expect(
      context.getByTestId('studio-playground-inspector'),
    ).toBeVisible();

    await setContextOpen(authenticatedPage, false);
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

    await authenticatedPage.getByTestId('topbar-context-toggle').click();

    await expect(contextSidebar).toHaveCount(0);
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'true');

    await selectToggle.click();
    await expect(selectToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(contextSidebar).toHaveCount(0);
  });
});
