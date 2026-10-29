import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The shared `ViewMenu`: one ghost button named `View: <active layout>` in the
 * subbar. Its menu lists every layout the page supports as `menuitemradio`
 * rows.
 */
export function viewMenuTrigger(
  scope: Page | Locator,
  active?: string,
): Locator {
  return scope.getByRole('button', {
    name: active === undefined ? /^View: / : `View: ${active}`,
    exact: active !== undefined,
  });
}

/** Opens the View menu and picks one layout. */
export async function chooseView(page: Page, name: string): Promise<void> {
  await viewMenuTrigger(page).click();
  await page.getByRole('menuitemradio', { exact: true, name }).click();
  await expect(viewMenuTrigger(page, name)).toBeVisible();
}
